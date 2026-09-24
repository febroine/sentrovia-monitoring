import { and, desc, eq, getTableColumns, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { getCompanyById } from "@/lib/companies/service";
import { db } from "@/lib/db";
import { monitorChecks, monitorDiagnostics, monitors, outageEvents } from "@/lib/db/schema";
import { getMonitorSlaPeriods } from "@/lib/monitoring/sla-service";
import { loadAvailabilityForWindows, type AvailabilityWindow } from "@/lib/outages/availability-service";

const MAX_RECENT_ROWS_PER_MONITOR = 100;
const COMPANY_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function listRecentMonitorChecks(
  userId: string,
  limitPerMonitor = 12,
  workspaceId?: string,
  monitorId?: string,
  around?: Date
) {
  const normalizedLimit = normalizePerMonitorLimit(limitPerMonitor);
  const rankedChecks = db
    .select({
      ...getTableColumns(monitorChecks),
      monitorRowNumber: sql<number>`row_number() over (
        partition by ${monitorChecks.monitorId}
        order by ${around
          ? sql`abs(extract(epoch from (${monitorChecks.createdAt} - ${around.toISOString()}::timestamptz)))`
          : sql`${monitorChecks.createdAt} desc`}
      )`.as("monitor_row_number"),
    })
    .from(monitorChecks)
    .where(and(
      workspaceId ? eq(monitorChecks.workspaceId, workspaceId) : eq(monitorChecks.userId, userId),
      monitorId ? eq(monitorChecks.monitorId, monitorId) : undefined
    ))
    .as("ranked_monitor_checks");
  const rows = await db
    .select()
    .from(rankedChecks)
    .where(lte(rankedChecks.monitorRowNumber, normalizedLimit))
    .orderBy(desc(rankedChecks.createdAt));

  return groupRecentRowsByMonitor(rows, normalizedLimit);
}

export async function listRecentMonitorDiagnostics(
  userId: string,
  limitPerMonitor = 3,
  workspaceId?: string,
  monitorId?: string,
  around?: Date
) {
  const normalizedLimit = normalizePerMonitorLimit(limitPerMonitor);
  const rankedDiagnostics = db
    .select({
      ...getTableColumns(monitorDiagnostics),
      monitorRowNumber: sql<number>`row_number() over (
        partition by ${monitorDiagnostics.monitorId}
        order by ${around
          ? sql`abs(extract(epoch from (${monitorDiagnostics.createdAt} - ${around.toISOString()}::timestamptz)))`
          : sql`${monitorDiagnostics.createdAt} desc`}
      )`.as("monitor_row_number"),
    })
    .from(monitorDiagnostics)
    .where(
      and(
        workspaceId
          ? eq(monitorDiagnostics.workspaceId, workspaceId)
          : eq(monitorDiagnostics.userId, userId),
        monitorId ? eq(monitorDiagnostics.monitorId, monitorId) : undefined
      )
    )
    .as("ranked_monitor_diagnostics");
  const rows = await db
    .select()
    .from(rankedDiagnostics)
    .where(lte(rankedDiagnostics.monitorRowNumber, normalizedLimit))
    .orderBy(desc(rankedDiagnostics.createdAt));

  return groupRecentRowsByMonitor(rows, normalizedLimit);
}

export async function listRecentOutageEvents(
  userId: string,
  limitPerMonitor = 8,
  workspaceId?: string,
  monitorId?: string,
  around?: Date
) {
  const normalizedLimit = normalizePerMonitorLimit(limitPerMonitor);
  const rankedEvents = db
    .select({
      ...getTableColumns(outageEvents),
      monitorRowNumber: sql<number>`row_number() over (
        partition by ${outageEvents.monitorId}
        order by ${around
          ? sql`abs(extract(epoch from (${outageEvents.createdAt} - ${around.toISOString()}::timestamptz)))`
          : sql`${outageEvents.createdAt} desc`}
      )`.as("monitor_row_number"),
    })
    .from(outageEvents)
    .where(and(
      workspaceId ? eq(outageEvents.workspaceId, workspaceId) : eq(outageEvents.userId, userId),
      monitorId ? eq(outageEvents.monitorId, monitorId) : undefined
    ))
    .as("ranked_outage_events");
  const rows = await db
    .select()
    .from(rankedEvents)
    .where(lte(rankedEvents.monitorRowNumber, normalizedLimit))
    .orderBy(desc(rankedEvents.createdAt));

  return groupRecentRowsByMonitor(rows, normalizedLimit);
}

export async function getCompanySlaReport(
  userId: string,
  companyId: string,
  now = new Date(),
  workspaceId?: string
) {
  const company = await getCompanyById(workspaceId ? { userId, workspaceId } : userId, companyId);
  if (!company) return null;

  const companyMonitors = await db
    .select({ id: monitors.id })
    .from(monitors)
    .where(and(
      workspaceId ? eq(monitors.workspaceId, workspaceId) : eq(monitors.userId, userId),
      eq(monitors.companyId, companyId),
      eq(monitors.isActive, true),
      isNull(monitors.deletedAt)
    ));
  const monitorIds = companyMonitors.map((monitor) => monitor.id);
  const recentChecksStartedAt = resolveCompanyRecentChecksStart(now);
  const [periods, recentChecks] = await Promise.all([
    getMonitorSlaPeriods(userId, monitorIds, now, workspaceId),
    monitorIds.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(monitorChecks)
          .where(and(
            workspaceId
              ? eq(monitorChecks.workspaceId, workspaceId)
              : eq(monitorChecks.userId, userId),
            inArray(monitorChecks.monitorId, monitorIds),
            gte(monitorChecks.createdAt, recentChecksStartedAt)
          ))
          .orderBy(desc(monitorChecks.createdAt))
          .limit(500),
  ]);
  const { averageLatencyMs, hasLatencySamples, statusCodes } = summarizeCompanyRecentChecks(recentChecks);

  return {
    companyId: company.id,
    companyName: company.name,
    monitorCount: companyMonitors.length,
    activeCount: companyMonitors.length,
    averageLatencyMs,
    hasLatencySamples,
    periods,
    statusCodes,
  };
}

export async function getCompanyMonthlyUptimeReport(
  userId: string,
  companyId: string,
  now = new Date(),
  workspaceId?: string
) {
  const company = await getCompanyById(workspaceId ? { userId, workspaceId } : userId, companyId);
  if (!company) return null;

  const companyMonitors = await db
    .select({ id: monitors.id })
    .from(monitors)
    .where(and(
      workspaceId ? eq(monitors.workspaceId, workspaceId) : eq(monitors.userId, userId),
      eq(monitors.companyId, companyId),
      eq(monitors.isActive, true),
      isNull(monitors.deletedAt)
    ));
  const monitorIds = companyMonitors.map((monitor) => monitor.id);
  if (monitorIds.length === 0) {
    return { companyId: company.id, companyName: company.name, months: [] };
  }

  const since = resolveCompanyMonthlyReportStart(now);
  const windows = buildMonthlyAvailabilityWindows(since, now);
  const availability = await loadAvailabilityForWindows(userId, monitorIds, windows, db, workspaceId);
  return {
    companyId: company.id,
    companyName: company.name,
    months: windows.map((window) => {
      const month = availability.get(window.key);
      return {
        label: window.key,
        hasData: month?.hasData ?? false,
        uptimePct: month?.hasData ? month.uptimePct : 0,
        checks: month?.completedChecks ?? 0,
      };
    }),
  };
}

export function resolveCompanyRecentChecksStart(now: Date) {
  return new Date(now.getTime() - COMPANY_RECENT_WINDOW_MS);
}

export function resolveCompanyMonthlyReportStart(now: Date) {
  const startedAt = new Date(now);
  startedAt.setUTCHours(0, 0, 0, 0);
  startedAt.setUTCDate(1);
  startedAt.setUTCMonth(startedAt.getUTCMonth() - 5);
  return startedAt;
}

export function summarizeCompanyRecentChecks(
  checks: Array<{ status: string; statusCode: number | null; latencyMs: number | null }>
) {
  const completedChecks = checks.filter((check) => check.status !== "pending");
  const latencyValues = completedChecks.map((check) => check.latencyMs).filter(isNumber);
  const statusCodes = buildStatusCodeSummary(completedChecks);
  return {
    averageLatencyMs: averageValue(latencyValues),
    hasLatencySamples: latencyValues.length > 0,
    statusCodes,
  };
}

export function normalizePerMonitorLimit(limitPerMonitor: number) {
  if (!Number.isFinite(limitPerMonitor)) {
    return 1;
  }

  return Math.min(MAX_RECENT_ROWS_PER_MONITOR, Math.max(1, Math.trunc(limitPerMonitor)));
}

function groupRecentRowsByMonitor<T extends { monitorId: string }>(rows: T[], limitPerMonitor: number) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const current = grouped.get(row.monitorId) ?? [];
    if (current.length >= limitPerMonitor) continue;
    current.push(row);
    grouped.set(row.monitorId, current);
  }
  return Object.fromEntries(Array.from(grouped, ([monitorId, items]) => [monitorId, items.reverse()]));
}

function buildStatusCodeSummary(checks: Array<{ statusCode: number | null }>) {
  const counts = new Map<number, number>();
  for (const check of checks) {
    if (typeof check.statusCode !== "number") continue;
    counts.set(check.statusCode, (counts.get(check.statusCode) ?? 0) + 1);
  }
  return Array.from(counts, ([statusCode, count]) => ({ statusCode, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
}

function averageValue(values: number[]) {
  return values.length === 0 ? 0 : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isNumber(value: number | null): value is number {
  return typeof value === "number";
}

export function buildMonthlyAvailabilityWindows(startedAt: Date, endedAt: Date): AvailabilityWindow[] {
  const windows: AvailabilityWindow[] = [];
  const cursor = new Date(startedAt);
  while (cursor < endedAt) {
    const next = new Date(cursor);
    next.setUTCMonth(next.getUTCMonth() + 1);
    windows.push({
      key: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`,
      startedAt: new Date(cursor),
      endedAt: new Date(Math.min(next.getTime(), endedAt.getTime())),
    });
    cursor.setTime(next.getTime());
  }
  return windows;
}
