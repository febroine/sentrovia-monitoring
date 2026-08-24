import { eq } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { env } from "@/lib/env";

export async function canUserAccessPrivateTargets(
  userId: string,
  database: DatabaseExecutor = db
) {
  if (!env.monitorAllowPrivateTargets) {
    return false;
  }

  const [user] = await database
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user?.role === "admin";
}
