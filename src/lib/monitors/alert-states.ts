import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitors } from "@/lib/db/schema";
import type { MonitorAlertSnapshot, MonitorAlertState } from "@/lib/browser-alerts/transitions";

// The small per-monitor state list an open console polls for browser alerts.
export async function listMonitorAlertStates(workspaceId: string, now = new Date()): Promise<MonitorAlertSnapshot[]> {
  const rows = await db
    .select({
      id: monitors.id,
      name: monitors.name,
      url: monitors.url,
      monitorType: monitors.monitorType,
      status: monitors.status,
      verificationMode: monitors.verificationMode,
      isActive: monitors.isActive,
      pausedUntil: monitors.pausedUntil,
    })
    .from(monitors)
    .where(and(eq(monitors.workspaceId, workspaceId), isNull(monitors.deletedAt)));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    // A heartbeat monitor's stored target is an internal identifier, not something to show.
    url: row.monitorType === "heartbeat" ? "Heartbeat monitor" : row.url,
    state: toMonitorAlertState(row, now),
  }));
}

export function toMonitorAlertState(
  monitor: { status: string; verificationMode: boolean; isActive: boolean; pausedUntil: Date | null },
  now: Date
): MonitorAlertState {
  if (!monitor.isActive || (monitor.pausedUntil && monitor.pausedUntil > now)) return "idle";
  // A failure is reported only once it is confirmed, like the outage alert.
  if (monitor.status === "down") return monitor.verificationMode ? "idle" : "down";
  return monitor.status === "up" ? "up" : "idle";
}
