import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { maintenanceWindows, monitors } from "@/lib/db/schema";

export type MaintenanceWindowInput = { monitorId: string | null; kind: "maintenance" | "silence"; title: string; startsAt: Date; endsAt: Date };

export async function listMaintenanceWindows(workspaceId: string) {
  return db.select({ id: maintenanceWindows.id, monitorId: maintenanceWindows.monitorId, kind: maintenanceWindows.kind, title: maintenanceWindows.title, startsAt: maintenanceWindows.startsAt, endsAt: maintenanceWindows.endsAt, cancelledAt: maintenanceWindows.cancelledAt, createdAt: maintenanceWindows.createdAt, monitorName: monitors.name }).from(maintenanceWindows).leftJoin(monitors, eq(maintenanceWindows.monitorId, monitors.id)).where(and(eq(maintenanceWindows.workspaceId, workspaceId), isNull(maintenanceWindows.cancelledAt))).orderBy(maintenanceWindows.startsAt);
}

export async function createMaintenanceWindow(workspaceId: string, userId: string, input: MaintenanceWindowInput) {
  await assertWorkspaceMonitor(workspaceId, input.monitorId);
  const [window] = await db.insert(maintenanceWindows).values({ ...input, workspaceId, createdByUserId: userId }).returning();
  return window;
}

export async function cancelMaintenanceWindow(workspaceId: string, id: string) {
  const [window] = await db.update(maintenanceWindows).set({ cancelledAt: new Date(), updatedAt: new Date() }).where(and(eq(maintenanceWindows.id, id), eq(maintenanceWindows.workspaceId, workspaceId), isNull(maintenanceWindows.cancelledAt))).returning();
  return window ?? null;
}

export async function getActiveNotificationSuppression(workspaceId: string, monitorId: string, now = new Date()) {
  const [window] = await db.select({ id: maintenanceWindows.id, title: maintenanceWindows.title, kind: maintenanceWindows.kind }).from(maintenanceWindows).where(and(eq(maintenanceWindows.workspaceId, workspaceId), isNull(maintenanceWindows.cancelledAt), lt(maintenanceWindows.startsAt, now), gt(maintenanceWindows.endsAt, now), or(isNull(maintenanceWindows.monitorId), eq(maintenanceWindows.monitorId, monitorId)))).limit(1);
  return window ?? null;
}

async function assertWorkspaceMonitor(workspaceId: string, monitorId: string | null) {
  if (!monitorId) return;
  const [monitor] = await db.select({ id: monitors.id }).from(monitors).where(and(eq(monitors.id, monitorId), eq(monitors.workspaceId, workspaceId), isNull(monitors.deletedAt))).limit(1);
  if (!monitor) throw new Error("Monitor was not found in the active workspace.");
}
