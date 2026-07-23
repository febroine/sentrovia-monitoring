import { and, desc, eq, isNull, ne, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitorEvents, monitors } from "@/lib/db/schema";
import { getDeliveryOverview } from "@/lib/delivery/service";
import { getSettings } from "@/lib/settings/service";
import { getWorkerState } from "@/lib/monitors/service";
import { intervalToMs } from "@/lib/monitors/utils";
import { getMonitorSlaPeriods, type SlaPeriodSummary } from "@/lib/monitoring/sla-service";
import { NOTIFICATION_MARKER_EVENT_TYPES } from "@/lib/monitors/event-types";
import { sanitizeWorkerStatusMessage } from "@/lib/worker/status-message";

export async function getDashboardData(userId: string) {
  const [monitorSection, settingsSection] = await Promise.all([
    loadDashboardSection("monitor status", getDashboardMonitors(userId), []),
    loadDashboardSection("workspace settings", getSettings(userId), null),
  ]);
  const monitorRows = monitorSection.data;
  const settings = settingsSection.data;

  const total = monitorRows.length;
  const activeRows = monitorRows.filter((monitor) => monitor.isActive);
  const [eventsSection, workerSection, deliverySection, slaSection] = await Promise.all([
    loadDashboardSection("recent events", getRecentDashboardEvents(userId), []),
    loadDashboardSection("worker health", getDashboardWorkerState(), DEFAULT_DASHBOARD_WORKER),
    loadDashboardSection("notification delivery", getDashboardDeliverySummary(userId), DEFAULT_DELIVERY_SUMMARY),
    loadDashboardSection(
      "SLA history",
      getMonitorSlaPeriods(userId, activeRows.map((monitor) => monitor.id)),
      DEFAULT_SLA_PERIODS
    ),
  ]);
  const eventRows = eventsSection.data;
  const worker = workerSection.data;
  const delivery = deliverySection.data;
  const [sla24Hours, sla7Days] = slaSection.data;
  const warnings = [monitorSection, settingsSection, eventsSection, workerSection, deliverySection, slaSection]
    .map((section) => section.warning)
    .filter((warning): warning is string => Boolean(warning));
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
    delivery,
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
    worker,
    warnings,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

const DEFAULT_DELIVERY_SUMMARY = {
  delivered: 0,
  failed: 0,
  retrying: 0,
  pendingWebhookRetries: 0,
};

const DEFAULT_DASHBOARD_WORKER = {
  running: false,
  desiredState: "stopped",
  statusMessage: "Worker health is temporarily unavailable.",
  connectivityStatus: "unknown",
  connectivityCheckedAt: null as string | null,
  connectivityMessage: null as string | null,
};

const DEFAULT_SLA_PERIODS: [SlaPeriodSummary, SlaPeriodSummary] = [
  { label: "24h SLA", uptimePct: 100, outages: 0, totalChecks: 0 },
  { label: "7d SLA", uptimePct: 100, outages: 0, totalChecks: 0 },
];

function getDashboardMonitors(userId: string) {
  return db
    .select({
      id: monitors.id,
      companyId: monitors.companyId,
      company: monitors.company,
      isActive: monitors.isActive,
      status: monitors.status,
      latencyMs: monitors.latencyMs,
      sslExpiresAt: monitors.sslExpiresAt,
      notificationPref: monitors.notificationPref,
      intervalValue: monitors.intervalValue,
      intervalUnit: monitors.intervalUnit,
    })
    .from(monitors)
    .where(and(eq(monitors.userId, userId), isNull(monitors.deletedAt)));
}

async function getRecentDashboardEvents(userId: string) {
  return db
    .select({
      id: monitorEvents.id,
      eventType: monitorEvents.eventType,
      message: monitorEvents.message,
      statusCode: monitorEvents.statusCode,
      latencyMs: monitorEvents.latencyMs,
      createdAt: monitorEvents.createdAt,
    })
    .from(monitorEvents)
    .where(and(
      eq(monitorEvents.userId, userId),
      ne(monitorEvents.eventType, "check"),
      notInArray(monitorEvents.eventType, [...NOTIFICATION_MARKER_EVENT_TYPES])
    ))
    .orderBy(desc(monitorEvents.createdAt))
    .limit(10);
}

async function getDashboardWorkerState() {
  const worker = await getWorkerState();
  return {
    running: worker.running,
    desiredState: worker.desiredState,
    statusMessage: sanitizeWorkerStatusMessage(worker.statusMessage),
    connectivityStatus: worker.connectivityStatus,
    connectivityCheckedAt: worker.connectivityCheckedAt?.toISOString() ?? null,
    connectivityMessage: worker.connectivityMessage,
  };
}

async function getDashboardDeliverySummary(userId: string) {
  return getDeliveryOverview(userId).then((delivery) => delivery.summary);
}

export async function loadDashboardSection<T>(label: string, request: Promise<T>, fallback: T) {
  try {
    return { data: await request, warning: null };
  } catch (error) {
    console.error(`[sentrovia] Dashboard ${label} unavailable.`, error);
    return { data: fallback, warning: label };
  }
}

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
