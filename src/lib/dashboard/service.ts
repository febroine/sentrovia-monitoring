import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitorChecks, monitorEvents, monitors } from "@/lib/db/schema";
import { getDeliveryOverview } from "@/lib/delivery/service";
import { getSettings } from "@/lib/settings/service";
import { getWorkerState } from "@/lib/monitors/service";

export async function getDashboardData(userId: string) {
  const [monitorRows, eventRows, checkRows, settings, worker, delivery] = await Promise.all([
    db.select().from(monitors).where(eq(monitors.userId, userId)),
    db.select().from(monitorEvents).where(eq(monitorEvents.userId, userId)).orderBy(desc(monitorEvents.createdAt)).limit(10),
    db.select().from(monitorChecks).where(eq(monitorChecks.userId, userId)).orderBy(desc(monitorChecks.createdAt)).limit(4000),
    getSettings(userId),
    getWorkerState(),
    getDeliveryOverview(userId),
  ]);

  const total = monitorRows.length;
  const activeRows = monitorRows.filter((monitor) => monitor.isActive);
  const activeMonitorIds = new Set(activeRows.map((monitor) => monitor.id));
  const activeCheckRows = checkRows.filter((check) => activeMonitorIds.has(check.monitorId));
  const active = activeRows.length;
  const paused = total - active;
  const online = activeRows.filter((monitor) => monitor.status === "up").length;
  const offline = activeRows.filter((monitor) => monitor.status === "down").length;
  const pending = activeRows.filter((monitor) => monitor.status === "pending").length;
  const latencyRows = activeRows.filter((monitor) => typeof monitor.latencyMs === "number");
  const avgLatency = latencyRows.length > 0 ? Math.round(latencyRows.reduce((sum, item) => sum + (item.latencyMs ?? 0), 0) / latencyRows.length) : 0;
  const certificateWatch = activeRows.filter((monitor) => {
    if (!monitor.sslExpiresAt) {
      return false;
    }

    return monitor.sslExpiresAt.getTime() - Date.now() < 1000 * 60 * 60 * 24 * 30;
  }).length;
  const configuredNotifications = activeRows.filter((monitor) => monitor.notificationPref !== "none").length;
  const silentMonitors = active - configuredNotifications;

  const companyHealth = Object.values(
    monitorRows.reduce<Record<string, { name: string; total: number; active: number; paused: number; up: number; down: number; pending: number }>>((acc, monitor) => {
      const key = monitor.company ?? "Unassigned";
      acc[key] ??= { name: key, total: 0, active: 0, paused: 0, up: 0, down: 0, pending: 0 };
      acc[key].total += 1;
      if (!monitor.isActive) {
        acc[key].paused += 1;
        return acc;
      }

      acc[key].active += 1;
      if (monitor.status === "up") acc[key].up += 1;
      if (monitor.status === "down") acc[key].down += 1;
      if (monitor.status === "pending") acc[key].pending += 1;
      return acc;
    }, {})
  );

  const recent24hChecks = activeCheckRows.filter((check) => check.createdAt.getTime() >= Date.now() - 1000 * 60 * 60 * 24);
  const recent7dChecks = activeCheckRows.filter((check) => check.createdAt.getTime() >= Date.now() - 1000 * 60 * 60 * 24 * 7);

  return {
    summary: { total, active, paused, online, offline, pending, coverage: active > 0 ? (online / active) * 100 : 0, avgLatency },
    companyHealth,
    monitors: monitorRows.slice(0, 6),
    events: eventRows,
    delivery: delivery.summary,
    posture: {
      configuredNotifications,
      silentMonitors,
      certificateWatch,
      averageIntervalMinutes:
        active > 0
          ? Math.round(activeRows.reduce((sum, monitor) => sum + monitor.intervalValue, 0) / active)
          : 0,
      statusCodeWatchCount:
        settings?.notifications.statusCodeAlertCodes
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean).length ?? 0,
      sla24h: computeUptimePct(recent24hChecks),
      sla7d: computeUptimePct(recent7dChecks),
    },
    settings,
    worker: {
      running: worker.running,
      desiredState: worker.desiredState,
      checkedCount: worker.checkedCount,
      statusMessage: worker.statusMessage,
    },
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

function computeUptimePct(checks: Array<typeof monitorChecks.$inferSelect>) {
  if (checks.length === 0) {
    return 100;
  }

  const upChecks = checks.filter((check) => check.status === "up").length;
  return (upChecks / checks.length) * 100;
}
