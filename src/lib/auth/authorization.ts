import { asc } from "drizzle-orm";
import { AuthError } from "@/lib/auth/errors";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function assertWorkspaceOwner(userId: string) {
  const ownerId = await getWorkspaceOwnerId();

  if (!ownerId || ownerId !== userId) {
    throw new AuthError("Only the workspace owner can perform this action.", 403);
  }
}

async function getWorkspaceOwnerId() {
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .orderBy(asc(users.createdAt))
    .limit(1);

  return owner?.id ?? null;
}
