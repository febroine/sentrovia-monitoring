import { and, eq } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/lib/db";
import { users, workspaceMembers } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { hasPermission, normalizeUserRole } from "@/lib/auth/permissions";

export async function canUserAccessPrivateTargets(
  userId: string,
  database: DatabaseExecutor = db,
  workspaceId?: string
) {
  if (!env.monitorAllowPrivateTargets) {
    return false;
  }

  if (workspaceId) {
    const [membership] = await database
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId)
      ))
      .limit(1);

    return hasPermission(normalizeUserRole(membership?.role), "private-targets.access");
  }

  const [user] = await database
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return hasPermission(normalizeUserRole(user?.role), "private-targets.access");
}
