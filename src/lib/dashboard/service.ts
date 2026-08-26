import { and, desc, eq, isNull, ne, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitorEvents, monitors } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/errors";
import { getCompanyById } from "@/lib/companies/service";
import { getDeliveryOverview } from "@/lib/delivery/service";
import { getSettings, updateDashboardPreferences as persistDashboardPreferences } from "@/lib/settings/service";
import {
  normalizeDashboardPreferences,
  type DashboardFocus,
  type DashboardPreferences,
} from "@/lib/dashboard/preferences";
import { getWorkerState } from "@/lib/monitors/service";
import { intervalToMs } from "@/lib/monitors/utils";
import { sanitizeMonitorUrlForDisplay } from "@/lib/monitors/targets";
import { NOTIFICATION_MARKER_EVENT_TYPES } from "@/lib/monitors/event-types";
import { sanitizeWorkerStatusMessage } from "@/lib/worker/status-message";

export async function getDashboardData(userId: string) {
  const [monitorSection, settingsSection] = await Promise.all([
    loadDashboardSection("monitor status", getDashboardMonitors(userId), []),
    loadDashboardSection("workspace settings", getSettings(userId), null),
  ]);
  const monitorRows = monitorSection.data;
  const settings = settingsSection.data;
  const preferences = normalizeDashboardPreferences({
    widgets: settings?.appearance.dashboardWidgets,
    companyId: settings?.appearance.dashboardCompanyId,
    focus: settings?.appearance.dashboardFocus,
  });
  const scopedMonitorRows = preferences.companyId
    ? monitorRows.filter((monitor) => monitor.companyId === preferences.companyId)
    : monitorRows;

  const total = scopedMonitorRows.length;
  const activeRows = scopedMonitorRows.filter((monitor) => monitor.isActive);
  const [eventsSection, workerSection, deliverySection] = await Promise.all([
    loadDashboardSection("recent events", getRecentDashboardEvents(userId, preferences.companyId), []),
    loadDashboardSection("worker health", getDashboardWorkerState(), DEFAULT_DASHBOARD_WORKER),
    loadDashboardSection("notification delivery", getDashboardDeliverySummary(userId), DEFAULT_DELIVERY_SUMMARY),
  ]);
  const eventRows = eventsSection.data;
  const worker = workerSection.data;
  const delivery = deliverySection.data;
  const warnings = [monitorSection, settingsSection, eventsSection, workerSection, deliverySection]
    .map((section) => section.warning)
    .filter((warning): warning is string => Boolean(warning));
  const active = activeRows.length;
  const paused = total - active;
  const online = activeRows.filter((monitor) => monitor.status === "up").length;
  const offline = activeRows.filter((monitor) => monitor.status === "down").length;
  const pending = activeRows.filter((monitor) => monitor.status === "pending").length;
  const avgLatency = calculateAverageLatency(activeRows);
  const certificateWatch = countCertificatesExpiringSoon(activeRows);
  const configuredNotifications = activeRows.filter((monitor) => monitor.notificationPref !== "none").length;
  const silentMonitors = active - configuredNotifications;

  const companyHealth = buildCompanyHealth(scopedMonitorRows);

  return {
    summary: {
      total: scopedMonitorRows.length,
      active,
      paused,
      online,
      offline,
      pending,
      coverage: active > 0 ? (online / active) * 100 : 0,
      avgLatency,
    },
    companyHealth,
    monitors: buildDashboardMonitorFocus(activeRows, preferences.focus),
    companyOptions: buildDashboardCompanyOptions(monitorRows),
    preferences,
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
  pendingRetries: 0,
  deadLettered: 0,
};

const DEFAULT_DASHBOARD_WORKER = {
  running: false,
  desiredState: "stopped",
  statusMessage: "Worker health is temporarily unavailable.",
  connectivityStatus: "unknown",
  connectivityCheckedAt: null as string | null,
  connectivityMessage: null as string | null,
};

type DashboardMonitorDatabaseRow = DashboardMonitorRow & {
  notificationPref: string;
  intervalValue: number;
  intervalUnit: string;
  sslExpiresAt: Date | null;
  checkSslExpiry: boolean;
};

async function getDashboardMonitors(userId: string): Promise<DashboardMonitorDatabaseRow[]> {
  try {
    return await db
      .select({
        id: monitors.id,
        name: monitors.name,
        monitorType: monitors.monitorType,
        url: monitors.url,
        companyId: monitors.companyId,
        company: monitors.company,
        isActive: monitors.isActive,
        isFavorite: monitors.isFavorite,
        isCritical: monitors.isCritical,
        status: monitors.status,
        statusCode: monitors.statusCode,
        latencyMs: monitors.latencyMs,
        sslExpiresAt: monitors.sslExpiresAt,
        checkSslExpiry: monitors.checkSslExpiry,
        lastCheckedAt: monitors.lastCheckedAt,
        notificationPref: monitors.notificationPref,
        intervalValue: monitors.intervalValue,
        intervalUnit: monitors.intervalUnit,
      })
      .from(monitors)
      .where(and(eq(monitors.userId, userId), isNull(monitors.deletedAt)));
  } catch (error) {
    if (!isSchemaDriftError(error)) {
      throw error;
    }

    try {
      const legacyRows = await db
        .select({
          id: monitors.id,
          name: monitors.name,
          monitorType: monitors.monitorType,
          url: monitors.url,
          companyId: monitors.companyId,
          company: monitors.company,
          isActive: monitors.isActive,
          status: monitors.status,
          statusCode: monitors.statusCode,
          latencyMs: monitors.latencyMs,
          sslExpiresAt: monitors.sslExpiresAt,
          checkSslExpiry: monitors.checkSslExpiry,
          lastCheckedAt: monitors.lastCheckedAt,
          notificationPref: monitors.notificationPref,
          intervalValue: monitors.intervalValue,
          intervalUnit: monitors.intervalUnit,
        })
        .from(monitors)
        .where(and(eq(monitors.userId, userId), isNull(monitors.deletedAt)));

      return legacyRows.map((monitor) => ({ ...monitor, isFavorite: false, isCritical: false }));
    } catch (legacyError) {
      if (!isSchemaDriftError(legacyError)) {
        throw legacyError;
      }

      const rowsWithoutSoftDelete = await db
        .select({
          id: monitors.id,
          name: monitors.name,
          monitorType: monitors.monitorType,
          url: monitors.url,
          companyId: monitors.companyId,
          company: monitors.company,
          isActive: monitors.isActive,
          status: monitors.status,
          statusCode: monitors.statusCode,
          latencyMs: monitors.latencyMs,
          sslExpiresAt: monitors.sslExpiresAt,
          checkSslExpiry: monitors.checkSslExpiry,
          lastCheckedAt: monitors.lastCheckedAt,
          notificationPref: monitors.notificationPref,
          intervalValue: monitors.intervalValue,
          intervalUnit: monitors.intervalUnit,
        })
        .from(monitors)
        .where(eq(monitors.userId, userId));

      return rowsWithoutSoftDelete.map((monitor) => ({ ...monitor, isFavorite: false, isCritical: false }));
    }
  }
}

function isSchemaDriftError(error: unknown): boolean {
  const current = (error ?? {}) as { code?: string; message?: string; cause?: unknown };
  if (current.code === "42703") {
    return true;
  }

  const message = current.message?.toLowerCase() ?? "";
  if (message.includes("column") && message.includes("does not exist")) {
    return true;
  }

  return current.cause ? isSchemaDriftError(current.cause) : false;
}

async function getRecentDashboardEvents(userId: string, companyId: string) {
  try {
    return await queryRecentDashboardEvents(userId, companyId, true);
  } catch (error) {
    if (!isSchemaDriftError(error)) {
      throw error;
    }

    return queryRecentDashboardEvents(userId, companyId, false);
  }
}

async function queryRecentDashboardEvents(userId: string, companyId: string, includeSoftDeleteFilter: boolean) {
  const conditions = [
    eq(monitorEvents.userId, userId),
    ne(monitorEvents.eventType, "check"),
    notInArray(monitorEvents.eventType, [...NOTIFICATION_MARKER_EVENT_TYPES]),
  ];

  if (includeSoftDeleteFilter) {
    conditions.push(isNull(monitors.deletedAt));
  }

  if (companyId) {
    conditions.push(eq(monitors.companyId, companyId));
  }

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
    .innerJoin(monitors, eq(monitors.id, monitorEvents.monitorId))
    .where(and(...conditions))
    .orderBy(desc(monitorEvents.createdAt))
    .limit(10);
}

export async function saveDashboardPreferences(userId: string, input: DashboardPreferences) {
  const preferences = normalizeDashboardPreferences(input);
  if (preferences.companyId) {
    const company = await getCompanyById(userId, preferences.companyId);
    if (!company) {
      throw new AuthError("The selected dashboard company is unavailable.", 400);
    }
  }

  await persistDashboardPreferences(userId, preferences);
  return getDashboardData(userId);
}

export function buildDashboardCompanyOptions(
  rows: Array<{ companyId: string | null; company: string | null }>
) {
  const groups = new Map<string, { id: string; name: string; monitorCount: number }>();
  for (const row of rows) {
    if (!row.companyId) {
      continue;
    }

    const current = groups.get(row.companyId);
    if (current) {
      current.monitorCount += 1;
      continue;
    }

    groups.set(row.companyId, {
      id: row.companyId,
      name: row.company ?? "Unnamed company",
      monitorCount: 1,
    });
  }

  return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name));
}

type DashboardMonitorRow = {
  id: string;
  name: string;
  monitorType: string;
  url: string;
  companyId: string | null;
  company: string | null;
  isActive: boolean;
  isFavorite: boolean;
  isCritical: boolean;
  status: string;
  statusCode: number | null;
  latencyMs: number | null;
  lastCheckedAt: Date | null;
};

export function buildDashboardMonitorFocus(rows: DashboardMonitorRow[], focus: DashboardFocus) {
  const filtered = focus === "favorites"
    ? rows.filter((monitor) => monitor.isFavorite)
    : focus === "critical"
      ? rows.filter((monitor) => monitor.isCritical)
      : rows;

  return filtered
    .sort(compareDashboardMonitors)
    .map((monitor) => ({
      id: monitor.id,
      name: monitor.name,
      monitorType: monitor.monitorType,
      url: sanitizeMonitorUrlForDisplay(monitor.url),
      companyId: monitor.companyId,
      company: monitor.company,
      isFavorite: monitor.isFavorite,
      isCritical: monitor.isCritical,
      status: monitor.status,
      statusCode: monitor.statusCode,
      latencyMs: monitor.latencyMs,
      lastCheckedAt: monitor.lastCheckedAt?.toISOString() ?? null,
    }));
}

function compareDashboardMonitors(left: DashboardMonitorRow, right: DashboardMonitorRow) {
  if (left.isCritical !== right.isCritical) {
    return left.isCritical ? -1 : 1;
  }

  if (left.isFavorite !== right.isFavorite) {
    return left.isFavorite ? -1 : 1;
  }

  const statusRank = (status: string) => (status === "down" ? 0 : status === "pending" ? 1 : 2);
  const statusDifference = statusRank(left.status) - statusRank(right.status);
  if (statusDifference !== 0) {
    return statusDifference;
  }

  return left.name.localeCompare(right.name);
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
    return null;
  }

  const upChecks = settledChecks.filter((check) => check.status === "up").length;
  return (upChecks / settledChecks.length) * 100;
}

export function calculateAverageLatency(rows: Array<{ latencyMs: number | null }>) {
  const latencyValues = rows
    .map((monitor) => monitor.latencyMs)
    .filter((latencyMs): latencyMs is number => typeof latencyMs === "number");
  if (latencyValues.length === 0) {
    return null;
  }

  return Math.round(latencyValues.reduce((sum, latencyMs) => sum + latencyMs, 0) / latencyValues.length);
}

export function countCertificatesExpiringSoon(
  rows: Array<{ checkSslExpiry: boolean; sslExpiresAt: Date | null }>,
  now = new Date()
) {
  const warningCutoff = now.getTime() + 30 * 24 * 60 * 60_000;
  return rows.filter((monitor) => (
    monitor.checkSslExpiry
    && monitor.sslExpiresAt !== null
    && monitor.sslExpiresAt.getTime() <= warningCutoff
  )).length;
}
