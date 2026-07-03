import { and, asc, count, eq, inArray } from "drizzle-orm";
import { AuthError } from "@/lib/auth/errors";
import type { UserRole } from "@/lib/auth/token";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

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
  input: {
    username: string;
    email: string;
  }
) {
  const canUpdateMember = await canManageMember(memberId, currentUserId);
  if (!canUpdateMember) {
    return null;
  }

  const [member] = await db
    .update(users)
    .set({
      username: normalizeUsername(input.username),
      email: input.email.trim(),
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
}

function normalizeUsername(value: string) {
  const username = value.trim().toLowerCase();
  return username.length > 0 ? username : null;
}

export async function deleteMembers(currentUserId: string, currentUserRole: UserRole, ids: string[]) {
  const memberIds = await filterDeletableMemberIds(currentUserId, currentUserRole, ids);
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

async function canManageMember(memberId: string, currentUserId: string) {
  if (memberId === currentUserId) {
    return true;
  }

  const [currentUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  return currentUser?.role === "admin";
}

async function filterDeletableMemberIds(currentUserId: string, currentUserRole: UserRole, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (currentUserRole !== "admin") {
    return filterSelfMemberIds(currentUserId, uniqueIds);
  }

  await assertAtLeastOneAdminRemains(uniqueIds);
  return uniqueIds;
}

async function assertAtLeastOneAdminRemains(idsToDelete: string[]) {
  const [row] = await db
    .select({ total: count() })
    .from(users)
    .where(eq(users.role, "admin"));

  const adminCount = row?.total ?? 0;
  const deletedAdmins = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), inArray(users.id, idsToDelete)));

  if (adminCount - deletedAdmins.length < 1) {
    throw new AuthError("At least one admin account must remain.", 400);
  }
}
