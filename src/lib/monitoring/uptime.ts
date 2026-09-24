import { db, type DatabaseExecutor } from "@/lib/db";
import { loadAvailabilityForWindows, type MonitorAvailability } from "@/lib/outages/availability-service";

export const MONITOR_UPTIME_WINDOW_MS = 7 * 24 * 60 * 60_000;
export const NO_MONITOR_UPTIME_DATA = "No data";

export async function getMonitorUptimeById(
  userId: string,
  monitorIds: string[],
  now = new Date(),
  database: DatabaseExecutor = db,
  workspaceId?: string
) {
  const uniqueMonitorIds = Array.from(new Set(monitorIds));
  if (uniqueMonitorIds.length === 0) {
    return new Map<string, string>();
  }

  const periods = await loadAvailabilityForWindows(userId, uniqueMonitorIds, [{
    key: "7d",
    startedAt: new Date(now.getTime() - MONITOR_UPTIME_WINDOW_MS),
    endedAt: now,
  }], database, workspaceId);
  const rows = periods.get("7d")?.monitors ?? new Map<string, MonitorAvailability>();
  return new Map(Array.from(rows, ([monitorId, availability]) => [monitorId, formatMonitorUptime(availability)]));
}

export function formatMonitorUptime(availability?: Pick<MonitorAvailability, "hasData" | "uptimePct">) {
  return availability?.hasData ? `${availability.uptimePct.toFixed(2)}%` : NO_MONITOR_UPTIME_DATA;
}
