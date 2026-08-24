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
import { users } from "@/lib/db/schema";

const ADMIN_MEMBERSHIP_ADVISORY_LOCK_KEY = 63_194_207;
type MemberSelectExecutor = Pick<typeof db, "select">;

export async function listMembers(currentUserId: string, currentUserRole: UserRole) {
  const rows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      department: users.department,
      role: users.role,
      username: users.username,
      organization: users.organization,
      jobTitle: users.jobTitle,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(hasPermission(currentUserRole, "members.read") ? undefined : eq(users.id, currentUserId))
    .orderBy(asc(users.firstName), asc(users.lastName));
  return rows.map((row) => ({ ...row, role: normalizeUserRole(row.role) }));
}

export async function updateMember(
  memberId: string,
  currentUserId: string,
  currentUserRole: UserRole,
  input: {
    username: string;
    email: string;
    role?: UserRole;
  }
) {
  if (memberId !== currentUserId && !hasPermission(currentUserRole, "members.manage")) {
    return null;
  }

  return db.transaction(async (tx) => {
    const [existingMember] = await tx
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, memberId))
      .limit(1);
    if (!existingMember) {
      return null;
    }

    const existingRole = normalizeUserRole(existingMember.role);
    const nextRole = input.role ?? existingRole;
    if (memberId !== currentUserId && !canManageMemberRole(currentUserRole, existingRole)) {
      throw new AuthError("You cannot manage a member with this role.", 403);
    }
    if (nextRole !== existingRole) {
      if (!canAssignRole(currentUserRole, nextRole)) {
        throw new AuthError("You cannot assign this workspace role.", 403);
      }

      await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_MEMBERSHIP_ADVISORY_LOCK_KEY})`);
      if (existingRole === "admin" && nextRole !== "admin") {
        await assertAtLeastOneAdminRemainsAfterDemotion(tx);
      }
    }

    const [member] = await tx
      .update(users)
      .set({
        username: normalizeUsername(input.username),
        email: input.email.trim(),
        role: nextRole,
        sessionVersion: nextRole === existingRole ? users.sessionVersion : sql`${users.sessionVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, memberId))
      .returning({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        department: users.department,
        role: users.role,
        sessionVersion: users.sessionVersion,
        username: users.username,
        organization: users.organization,
        jobTitle: users.jobTitle,
        createdAt: users.createdAt,
      });

    return member ? { ...member, role: normalizeUserRole(member.role) } : null;
  });
}

function normalizeUsername(value: string) {
  const username = value.trim().toLowerCase();
  return username.length > 0 ? username : null;
}

export async function deleteMembers(currentUserId: string, currentUserRole: UserRole, ids: string[]) {
  const memberIds = normalizeMemberIds(ids);
  if (memberIds.length === 0) {
    return [];
  }

  if (!hasPermission(currentUserRole, "members.manage")) {
    return deleteMembersById(filterSelfMemberIds(currentUserId, memberIds));
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_MEMBERSHIP_ADVISORY_LOCK_KEY})`);
    const targets = await tx
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(inArray(users.id, memberIds));
    if (targets.some((target) =>
      target.id !== currentUserId && !canManageMemberRole(currentUserRole, normalizeUserRole(target.role))
    )) {
      throw new AuthError("You cannot delete a member with this role.", 403);
    }
    await assertAtLeastOneAdminRemains(tx, memberIds);

    return tx
      .delete(users)
      .where(inArray(users.id, memberIds))
      .returning({ id: users.id });
  });
}

function deleteMembersById(memberIds: string[]) {
  if (memberIds.length === 0) {
    return [];
  }

  return db
    .delete(users)
    .where(inArray(users.id, memberIds))
    .returning({ id: users.id });
}

export function filterSelfMemberIds(currentUserId: string, ids: string[]) {
  return Array.from(new Set(ids.filter((id) => id === currentUserId)));
}

function normalizeMemberIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

async function assertAtLeastOneAdminRemains(executor: MemberSelectExecutor, idsToDelete: string[]) {
  const [row] = await executor
    .select({ total: count() })
    .from(users)
    .where(eq(users.role, "admin"));

  const adminCount = row?.total ?? 0;
  const deletedAdmins = await executor
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), inArray(users.id, idsToDelete)));

  assertAdminDeletionLeavesAdministrator(adminCount, deletedAdmins.length);
}

async function assertAtLeastOneAdminRemainsAfterDemotion(executor: MemberSelectExecutor) {
  const [row] = await executor
    .select({ total: count() })
    .from(users)
    .where(eq(users.role, "admin"));

  assertAdminDemotionLeavesAdministrator(row?.total ?? 0);
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
