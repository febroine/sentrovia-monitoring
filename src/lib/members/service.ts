import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/errors";
import type { UserRole } from "@/lib/auth/token";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const ADMIN_MEMBERSHIP_ADVISORY_LOCK_KEY = 63_194_207;
type MemberSelectExecutor = Pick<typeof db, "select">;

export async function listMembers(currentUserId: string, currentUserRole: UserRole) {
  return db
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
    .where(currentUserRole === "admin" ? undefined : eq(users.id, currentUserId))
    .orderBy(asc(users.firstName), asc(users.lastName));
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
  if (memberId !== currentUserId && currentUserRole !== "admin") {
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

    const nextRole = input.role ?? existingMember.role;
    if (nextRole !== existingMember.role) {
      if (currentUserRole !== "admin") {
        throw new AuthError("Only admins can change workspace roles.", 403);
      }

      await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_MEMBERSHIP_ADVISORY_LOCK_KEY})`);
      if (existingMember.role === "admin" && nextRole === "member") {
        await assertAtLeastOneAdminRemainsAfterDemotion(tx);
      }
    }

    const [member] = await tx
      .update(users)
      .set({
        username: normalizeUsername(input.username),
        email: input.email.trim(),
        role: nextRole,
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
        username: users.username,
        organization: users.organization,
        jobTitle: users.jobTitle,
        createdAt: users.createdAt,
      });

    return member ?? null;
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

  if (currentUserRole !== "admin") {
    return deleteMembersById(filterSelfMemberIds(currentUserId, memberIds));
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_MEMBERSHIP_ADVISORY_LOCK_KEY})`);
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
