import { and, eq, gt, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/lib/db";
import { monitorChecks, monitorOutages, monitors } from "@/lib/db/schema";
import { calculateMonitorReportDurationMs, calculateTimeUptimePct, summarizeOutages, type ReportOutage } from "@/lib/outages/metrics";

export type AvailabilityWindow = { key: string; startedAt: Date; endedAt: Date };

export type MonitorAvailability = {
  hasData: boolean;
  incompleteHistory: boolean;
  uptimePct: number;
  observedMs: number;
  downtimeMs: number;
  incidentCount: number;
  completedChecks: number;
};

export type AvailabilityResult = {
  monitors: Map<string, MonitorAvailability>;
  hasData: boolean;
  incompleteHistory: boolean;
  uptimePct: number;
  incidentCount: number;
  completedChecks: number;
};

export async function loadAvailabilityForWindows(
  userId: string,
  monitorIds: string[],
  windows: AvailabilityWindow[],
  database: DatabaseExecutor = db,
  workspaceId?: string
) {
  const uniqueIds = Array.from(new Set(monitorIds));
  if (uniqueIds.length === 0 || windows.length === 0) return new Map<string, AvailabilityResult>();

  const earliestStart = new Date(Math.min(...windows.map((window) => window.startedAt.getTime())));
  const latestEnd = new Date(Math.max(...windows.map((window) => window.endedAt.getTime())));
  const ownership = workspaceId ? eq(monitors.workspaceId, workspaceId) : eq(monitors.userId, userId);
  const checkOwnership = workspaceId ? eq(monitorChecks.workspaceId, workspaceId) : eq(monitorChecks.userId, userId);
  const outageOwnership = workspaceId ? eq(monitorOutages.workspaceId, workspaceId) : eq(monitorOutages.userId, userId);
  const [monitorRows, outageRows, ...checkRowsByWindow] = await Promise.all([
    database.select({ id: monitors.id, createdAt: monitors.createdAt })
      .from(monitors)
      .where(and(ownership, inArray(monitors.id, uniqueIds), isNull(monitors.deletedAt))),
    database.select({
      monitorId: monitorOutages.monitorId,
      startedAt: monitorOutages.startedAt,
      resolvedAt: monitorOutages.resolvedAt,
    }).from(monitorOutages).where(and(
      outageOwnership,
      inArray(monitorOutages.monitorId, uniqueIds),
      lt(monitorOutages.startedAt, latestEnd),
      or(isNull(monitorOutages.resolvedAt), gt(monitorOutages.resolvedAt, earliestStart))
    )),
    ...windows.map((window) => database.select({
      monitorId: monitorChecks.monitorId,
      completedChecks: sql<number>`count(*) filter (where ${monitorChecks.status} in ('up', 'down'))::int`,
      downChecks: sql<number>`count(*) filter (where ${monitorChecks.status} = 'down')::int`,
    }).from(monitorChecks).where(and(
      checkOwnership,
      inArray(monitorChecks.monitorId, uniqueIds),
      gte(monitorChecks.createdAt, window.startedAt),
      lt(monitorChecks.createdAt, window.endedAt)
    )).groupBy(monitorChecks.monitorId)),
  ]);

  return new Map(windows.map((window, index) => [
    window.key,
    summarizeAvailabilityWindow(monitorRows, checkRowsByWindow[index], outageRows, window),
  ]));
}

export function summarizeAvailabilityWindow(
  monitorRows: Array<{ id: string; createdAt: Date }>,
  checkRows: Array<{ monitorId: string; completedChecks: number; downChecks: number }>,
  outageRows: ReportOutage[],
  window: AvailabilityWindow
): AvailabilityResult {
    const countsByMonitor = new Map(checkRows.map((row) => [row.monitorId, row]));
    const outagesByMonitor = summarizeOutages(outageRows, window.startedAt, window.endedAt);
    const availability = new Map<string, MonitorAvailability>();
    let observedMs = 0;
    let downtimeMs = 0;
    let incidentCount = 0;
    let completedChecks = 0;
    let incompleteHistory = false;

    for (const monitor of monitorRows) {
      const counts = countsByMonitor.get(monitor.id);
      const outage = outagesByMonitor.get(monitor.id);
      const completedChecksForMonitor = Number(counts?.completedChecks ?? 0);
      const monitorDownChecks = Number(counts?.downChecks ?? 0);
      const monitorIncidents = outage?.incidentCount ?? 0;
      const missingOutageHistory = monitorDownChecks > 0 && monitorIncidents === 0;
      const durationMs = calculateMonitorReportDurationMs(window.startedAt, window.endedAt, monitor.createdAt);
      const hasData = durationMs > 0 && !missingOutageHistory && (completedChecksForMonitor > 0 || monitorIncidents > 0);
      const monitorDowntimeMs = outage?.downtimeMs ?? 0;
      availability.set(monitor.id, {
        hasData,
        incompleteHistory: missingOutageHistory,
        uptimePct: hasData ? calculateTimeUptimePct(durationMs, monitorDowntimeMs) : 0,
        observedMs: hasData ? durationMs : 0,
        downtimeMs: monitorDowntimeMs,
        incidentCount: monitorIncidents,
        completedChecks: completedChecksForMonitor,
      });
      if (hasData) {
        observedMs += durationMs;
        downtimeMs += monitorDowntimeMs;
      }
      incidentCount += monitorIncidents;
      completedChecks += completedChecksForMonitor;
      incompleteHistory ||= missingOutageHistory;
    }

    return {
      monitors: availability,
      hasData: observedMs > 0 && !incompleteHistory,
      incompleteHistory,
      uptimePct: calculateTimeUptimePct(observedMs, downtimeMs),
      incidentCount,
      completedChecks,
    };
}
