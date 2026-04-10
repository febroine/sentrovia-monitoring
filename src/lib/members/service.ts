import { and, asc, eq, inArray, ne } from "drizzle-orm";
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
    .where(eq(users.id, memberId))
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

export async function deleteMembers(ids: string[], currentUserId: string) {
  if (ids.length === 0) {
    return [];
  }

  return db
    .delete(users)
    .where(and(inArray(users.id, ids), ne(users.id, currentUserId)))
    .returning({ id: users.id });
}
