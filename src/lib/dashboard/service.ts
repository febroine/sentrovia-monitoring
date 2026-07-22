import { and, desc, eq, isNull, ne, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitorEvents, monitors } from "@/lib/db/schema";
import { getDeliveryOverview } from "@/lib/delivery/service";
import { getSettings } from "@/lib/settings/service";
import { getWorkerState } from "@/lib/monitors/service";
import { intervalToMs } from "@/lib/monitors/utils";
import { getMonitorSlaPeriods } from "@/lib/monitoring/sla-service";
import { NOTIFICATION_MARKER_EVENT_TYPES } from "@/lib/monitors/event-types";

export async function getDashboardData(userId: string) {
  const [monitorRows, eventRows, settings, worker, delivery] = await Promise.all([
    db.select().from(monitors).where(and(eq(monitors.userId, userId), isNull(monitors.deletedAt))),
    db
      .select()
      .from(monitorEvents)
      .where(and(
        eq(monitorEvents.userId, userId),
        ne(monitorEvents.eventType, "check"),
        notInArray(monitorEvents.eventType, [...NOTIFICATION_MARKER_EVENT_TYPES])
      ))
      .orderBy(desc(monitorEvents.createdAt))
      .limit(10),
    getSettings(userId),
    getWorkerState(),
    getDeliveryOverview(userId),
  ]);

  const total = monitorRows.length;
  const activeRows = monitorRows.filter((monitor) => monitor.isActive);
  const [sla24Hours, sla7Days] = await getMonitorSlaPeriods(
    userId,
    activeRows.map((monitor) => monitor.id)
  );
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

  const companyHealth = buildCompanyHealth(monitorRows);

  return {
    summary: { total, active, paused, online, offline, pending, coverage: active > 0 ? (online / active) * 100 : 0, avgLatency },
    companyHealth,
    monitors: activeRows.slice(0, 6),
    events: eventRows,
    delivery: delivery.summary,
    posture: {
      configuredNotifications,
      silentMonitors,
      certificateWatch,
      averageIntervalMinutes: calculateAverageIntervalMinutes(activeRows),
      statusCodeWatchCount:
        settings?.notifications.statusCodeAlertCodes
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean).length ?? 0,
      sla24h: sla24Hours.uptimePct,
      sla7d: sla7Days.uptimePct,
    },
    settings,
    worker: {
      running: worker.running,
      desiredState: worker.desiredState,
      statusMessage: worker.statusMessage,
      connectivityStatus: worker.connectivityStatus,
      connectivityCheckedAt: worker.connectivityCheckedAt?.toISOString() ?? null,
      connectivityMessage: worker.connectivityMessage,
    },
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

type CompanyHealthMonitor = {
  companyId: string | null;
  company: string | null;
  isActive: boolean;
  status: string;
};

export function buildCompanyHealth(rows: CompanyHealthMonitor[]) {
  return Object.values(
    rows.reduce<Record<string, { id: string; name: string; total: number; active: number; paused: number; up: number; down: number; pending: number }>>(
      (groups, monitor) => {
        const key = monitor.companyId ?? "__unassigned__";
        groups[key] ??= {
          id: key,
          name: monitor.company ?? "Unassigned",
          total: 0,
          active: 0,
          paused: 0,
          up: 0,
          down: 0,
          pending: 0,
        };
        const group = groups[key];
        group.total += 1;

        if (!monitor.isActive) {
          group.paused += 1;
        } else {
          group.active += 1;
          if (monitor.status === "up") group.up += 1;
          if (monitor.status === "down") group.down += 1;
          if (monitor.status === "pending") group.pending += 1;
        }

        return groups;
      },
      {}
    )
  );
}

export function calculateAverageIntervalMinutes(
  rows: Array<{ intervalValue: number; intervalUnit: string }>
) {
  if (rows.length === 0) {
    return 0;
  }

  const totalMinutes = rows.reduce(
    (sum, monitor) => sum + intervalToMs(monitor.intervalValue, monitor.intervalUnit) / 60_000,
    0
  );

  return Math.round(totalMinutes / rows.length);
}

export function computeUptimePct(checks: Array<{ status: string }>) {
  const settledChecks = checks.filter((check) => check.status !== "pending");
  if (settledChecks.length === 0) {
    return 100;
  }

  const upChecks = settledChecks.filter((check) => check.status === "up").length;
  return (upChecks / settledChecks.length) * 100;
}
