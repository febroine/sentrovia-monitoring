import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/lib/db";
import { monitorChecks } from "@/lib/db/schema";

export const MONITOR_UPTIME_WINDOW_MS = 7 * 24 * 60 * 60_000;
export const NO_MONITOR_UPTIME_DATA = "No data";

export interface MonitorUptimeCounts {
  totalChecks: number;
  upChecks: number;
}

export async function getMonitorUptimeById(
  userId: string,
  monitorIds: string[],
  now = new Date(),
  database: DatabaseExecutor = db
) {
  const uniqueMonitorIds = Array.from(new Set(monitorIds));
  if (uniqueMonitorIds.length === 0) {
    return new Map<string, string>();
  }

  const rows = await database
    .select({
      monitorId: monitorChecks.monitorId,
      totalChecks: sql<number>`count(*) filter (where ${monitorChecks.status} in ('up', 'down'))::integer`,
      upChecks: sql<number>`count(*) filter (where ${monitorChecks.status} = 'up')::integer`,
    })
    .from(monitorChecks)
    .where(and(
      eq(monitorChecks.userId, userId),
      inArray(monitorChecks.monitorId, uniqueMonitorIds),
      gte(monitorChecks.createdAt, new Date(now.getTime() - MONITOR_UPTIME_WINDOW_MS))
    ))
    .groupBy(monitorChecks.monitorId);

  return new Map(rows.map((row) => [
    row.monitorId,
    formatMonitorUptime({
      totalChecks: Number(row.totalChecks),
      upChecks: Number(row.upChecks),
    }),
  ]));
}

export function formatMonitorUptime(counts?: MonitorUptimeCounts) {
  const totalChecks = Math.max(0, counts?.totalChecks ?? 0);
  if (totalChecks === 0) {
    return NO_MONITOR_UPTIME_DATA;
  }

  const upChecks = Math.min(totalChecks, Math.max(0, counts?.upChecks ?? 0));
  return `${((upChecks / totalChecks) * 100).toFixed(2)}%`;
}
