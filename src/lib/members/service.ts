import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function listMembers() {
  return db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      department: users.department,
      username: users.username,
      organization: users.organization,
      jobTitle: users.jobTitle,
      createdAt: users.createdAt,
    })
    .from(users)
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
  const [member] = await db
    .update(users)
    .set({
      username: input.username.trim() || null,
      email: input.email.trim(),
      updatedAt: new Date(),
    })
    .where(and(eq(users.id, memberId), eq(users.id, currentUserId)))
    .returning({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      department: users.department,
      username: users.username,
      organization: users.organization,
      jobTitle: users.jobTitle,
      createdAt: users.createdAt,
    });

  return member ?? null;
}

export async function deleteMembers(currentUserId: string, ids: string[]) {
  const memberIds = filterSelfMemberIds(currentUserId, ids);
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
