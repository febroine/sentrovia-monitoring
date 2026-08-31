import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/errors";
import type { UserRole } from "@/lib/auth/token";
import {
  canAssignRole,
  canManageMemberRole,
  hasPermission,
  normalizeUserRole,
} from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { users, workspaceMembers } from "@/lib/db/schema";

const ADMIN_MEMBERSHIP_ADVISORY_LOCK_KEY = 63_194_207;
type MemberSelectExecutor = Pick<typeof db, "select">;

const memberColumns = {
  id: users.id,
  firstName: users.firstName,
  lastName: users.lastName,
  email: users.email,
  department: users.department,
  role: workspaceMembers.role,
  sessionVersion: users.sessionVersion,
  username: users.username,
  organization: users.organization,
  jobTitle: users.jobTitle,
  createdAt: users.createdAt,
};

export async function listMembers(
  workspaceId: string,
  currentUserId: string,
  currentUserRole: UserRole
) {
  const membershipFilter = hasPermission(currentUserRole, "members.read")
    ? eq(workspaceMembers.workspaceId, workspaceId)
    : and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, currentUserId));

  const rows = await db
    .select(memberColumns)
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(membershipFilter)
    .orderBy(asc(users.firstName), asc(users.lastName));

  return rows.map((row) => ({ ...row, role: normalizeUserRole(row.role) }));
}

export async function updateMember(
  workspaceId: string,
  memberId: string,
  currentUserId: string,
  currentUserRole: UserRole,
  input: { username: string; email: string; role?: UserRole }
) {
  if (memberId !== currentUserId && !hasPermission(currentUserRole, "members.manage")) {
    return null;
  }

  return db.transaction(async (tx) => {
    const existingRole = await findMemberRole(tx, workspaceId, memberId);
    if (!existingRole) {
      return null;
    }

    const nextRole = input.role ?? existingRole;
    assertRoleChangeAllowed(currentUserId, memberId, currentUserRole, existingRole, nextRole);
    if (nextRole !== existingRole) {
      await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_MEMBERSHIP_ADVISORY_LOCK_KEY})`);
      if (existingRole === "admin" && nextRole !== "admin") {
        await assertAtLeastOneAdminRemainsAfterDemotion(tx, workspaceId);
      }
      await tx
        .update(workspaceMembers)
        .set({ role: nextRole, updatedAt: new Date() })
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, memberId)));
    }

    await tx
      .update(users)
      .set({
        username: normalizeUsername(input.username),
        email: input.email.trim(),
        role: nextRole,
        sessionVersion: nextRole === existingRole ? users.sessionVersion : sql`${users.sessionVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, memberId));

    return selectMember(tx, workspaceId, memberId);
  });
}

export async function deleteMembers(
  workspaceId: string,
  currentUserId: string,
  currentUserRole: UserRole,
  ids: string[]
) {
  const requestedIds = normalizeMemberIds(ids);
  const memberIds = hasPermission(currentUserRole, "members.manage")
    ? requestedIds
    : filterSelfMemberIds(currentUserId, requestedIds);
  if (memberIds.length === 0) {
    return [];
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_MEMBERSHIP_ADVISORY_LOCK_KEY})`);
    const targets = await tx
      .select({ id: workspaceMembers.userId, role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(workspaceMembers.userId, memberIds)));

    assertTargetsManageable(currentUserId, currentUserRole, targets);
    await assertAtLeastOneAdminRemains(tx, workspaceId, targets);

    const removed = await tx
      .delete(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(workspaceMembers.userId, memberIds)))
      .returning({ id: workspaceMembers.userId });

    await deleteOrphanedUsers(tx, removed.map((member) => member.id));
    return removed;
  });
}

function assertRoleChangeAllowed(
  currentUserId: string,
  memberId: string,
  currentUserRole: UserRole,
  existingRole: UserRole,
  nextRole: UserRole
) {
  if (memberId !== currentUserId && !canManageMemberRole(currentUserRole, existingRole)) {
    throw new AuthError("You cannot manage a member with this role.", 403);
  }
  if (nextRole !== existingRole && !canAssignRole(currentUserRole, nextRole)) {
    throw new AuthError("You cannot assign this workspace role.", 403);
  }
}

function assertTargetsManageable(
  currentUserId: string,
  currentUserRole: UserRole,
  targets: Array<{ id: string; role: string }>
) {
  const forbidden = targets.some((target) =>
    target.id !== currentUserId && !canManageMemberRole(currentUserRole, normalizeUserRole(target.role))
  );
  if (forbidden) {
    throw new AuthError("You cannot delete a member with this role.", 403);
  }
}

async function findMemberRole(executor: MemberSelectExecutor, workspaceId: string, memberId: string) {
  const [membership] = await executor
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, memberId)))
    .limit(1);
  return membership ? normalizeUserRole(membership.role) : null;
}

async function selectMember(executor: MemberSelectExecutor, workspaceId: string, memberId: string) {
  const [member] = await executor
    .select(memberColumns)
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, memberId)))
    .limit(1);
  return member ? { ...member, role: normalizeUserRole(member.role) } : null;
}

async function assertAtLeastOneAdminRemains(
  executor: MemberSelectExecutor,
  workspaceId: string,
  targets: Array<{ id: string; role: string }>
) {
  const [row] = await executor
    .select({ total: count() })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "admin")));
  const deletedAdmins = targets.filter((target) => normalizeUserRole(target.role) === "admin").length;
  assertAdminDeletionLeavesAdministrator(row?.total ?? 0, deletedAdmins);
}

async function assertAtLeastOneAdminRemainsAfterDemotion(
  executor: MemberSelectExecutor,
  workspaceId: string
) {
  const [row] = await executor
    .select({ total: count() })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "admin")));
  assertAdminDemotionLeavesAdministrator(row?.total ?? 0);
}

async function deleteOrphanedUsers(executor: Pick<typeof db, "delete">, memberIds: string[]) {
  if (memberIds.length === 0) {
    return;
  }
  await executor
    .delete(users)
    .where(and(
      inArray(users.id, memberIds),
      sql`not exists (select 1 from ${workspaceMembers} where ${workspaceMembers.userId} = ${users.id})`
    ));
}

function normalizeUsername(value: string) {
  const username = value.trim().toLowerCase();
  return username.length > 0 ? username : null;
}

export function filterSelfMemberIds(currentUserId: string, ids: string[]) {
  return Array.from(new Set(ids.filter((id) => id === currentUserId)));
}

function normalizeMemberIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

export function assertAdminDemotionLeavesAdministrator(adminCount: number) {
  if (adminCount < 2) {
    throw new AuthError("At least one admin account must remain.", 400);
  }
}

export function assertAdminDeletionLeavesAdministrator(adminCount: number, deletedAdminCount: number) {
  if (adminCount - deletedAdminCount < 1) {
    throw new AuthError("At least one admin account must remain.", 400);
  }
}
