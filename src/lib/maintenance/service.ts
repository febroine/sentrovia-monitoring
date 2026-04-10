import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { maintenanceWindows } from "@/lib/db/schema";

export async function hasActiveMaintenanceWindow(userId: string, now = new Date()) {
  const rows = await db
    .select()
    .from(maintenanceWindows)
    .where(
      and(
        eq(maintenanceWindows.userId, userId),
        eq(maintenanceWindows.isActive, true),
        lte(maintenanceWindows.startsAt, now),
        gte(maintenanceWindows.endsAt, now)
      )
    );

  return rows.some((row) => row.suppressNotifications);
}
