import { and, asc, desc, eq, getTableColumns, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { getCompanyById } from "@/lib/companies/service";
import { db } from "@/lib/db";
import { monitorChecks, monitorDiagnostics, monitors, outageEvents } from "@/lib/db/schema";
import { getMonitorSlaPeriods } from "@/lib/monitoring/sla-service";

const MAX_RECENT_ROWS_PER_MONITOR = 100;
const COMPANY_RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function listRecentMonitorChecks(
  userId: string,
  limitPerMonitor = 12,
  workspaceId?: string
) {
  const normalizedLimit = normalizePerMonitorLimit(limitPerMonitor);
  const rankedChecks = db
    .select({
      ...getTableColumns(monitorChecks),
      monitorRowNumber: sql<number>`row_number() over (
        partition by ${monitorChecks.monitorId}
        order by ${monitorChecks.createdAt} desc
      )`.as("monitor_row_number"),
    })
    .from(monitorChecks)
    .where(workspaceId ? eq(monitorChecks.workspaceId, workspaceId) : eq(monitorChecks.userId, userId))
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
  workspaceId?: string
) {
  const normalizedLimit = normalizePerMonitorLimit(limitPerMonitor);
  const rankedDiagnostics = db
    .select({
      ...getTableColumns(monitorDiagnostics),
      monitorRowNumber: sql<number>`row_number() over (
        partition by ${monitorDiagnostics.monitorId}
        order by ${monitorDiagnostics.createdAt} desc
      )`.as("monitor_row_number"),
    })
    .from(monitorDiagnostics)
    .where(
      workspaceId
        ? eq(monitorDiagnostics.workspaceId, workspaceId)
        : eq(monitorDiagnostics.userId, userId)
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
  workspaceId?: string
) {
  const normalizedLimit = normalizePerMonitorLimit(limitPerMonitor);
  const rankedEvents = db
    .select({
      ...getTableColumns(outageEvents),
      monitorRowNumber: sql<number>`row_number() over (
        partition by ${outageEvents.monitorId}
        order by ${outageEvents.createdAt} desc
      )`.as("monitor_row_number"),
    })
    .from(outageEvents)
    .where(workspaceId ? eq(outageEvents.workspaceId, workspaceId) : eq(outageEvents.userId, userId))
    .as("ranked_outage_events");
  const rows = await db
    .select()
    .from(rankedEvents)
    .where(lte(rankedEvents.monitorRowNumber, normalizedLimit))
    .orderBy(desc(rankedEvents.createdAt));

  return groupRecentRowsByMonitor(rows, normalizedLimit);
}

export async function getCompanySlaReport(userId: string, companyId: string, now = new Date()) {
  const company = await getCompanyById(userId, companyId);
  if (!company) return null;

  const companyMonitors = await db
    .select({ id: monitors.id })
    .from(monitors)
    .where(and(
      eq(monitors.userId, userId),
      eq(monitors.companyId, companyId),
      eq(monitors.isActive, true),
      isNull(monitors.deletedAt)
    ));
  const monitorIds = companyMonitors.map((monitor) => monitor.id);
  const recentChecksStartedAt = resolveCompanyRecentChecksStart(now);
  const [periods, recentChecks] = await Promise.all([
    getMonitorSlaPeriods(userId, monitorIds, now),
    monitorIds.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(monitorChecks)
          .where(and(
            eq(monitorChecks.userId, userId),
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

export async function getCompanyMonthlyUptimeReport(userId: string, companyId: string, now = new Date()) {
  const company = await getCompanyById(userId, companyId);
  if (!company) return null;

  const companyMonitors = await db
    .select({ id: monitors.id })
    .from(monitors)
    .where(and(
      eq(monitors.userId, userId),
      eq(monitors.companyId, companyId),
      eq(monitors.isActive, true),
      isNull(monitors.deletedAt)
    ));
  const monitorIds = companyMonitors.map((monitor) => monitor.id);
  if (monitorIds.length === 0) {
    return { companyId: company.id, companyName: company.name, months: [] };
  }

  const since = resolveCompanyMonthlyReportStart(now);
  const checks = await db
    .select({ status: monitorChecks.status, createdAt: monitorChecks.createdAt })
    .from(monitorChecks)
    .where(and(
      eq(monitorChecks.userId, userId),
      inArray(monitorChecks.monitorId, monitorIds),
      gte(monitorChecks.createdAt, since)
    ))
    .orderBy(asc(monitorChecks.createdAt));

  return { companyId: company.id, companyName: company.name, months: buildMonthlyUptime(checks) };
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

function buildMonthlyUptime(checks: Array<{ status: string; createdAt: Date }>) {
  const buckets = new Map<string, { total: number; up: number }>();
  for (const check of checks) {
    if (check.status === "pending") continue;
    const key = `${check.createdAt.getUTCFullYear()}-${String(check.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key) ?? { total: 0, up: 0 };
    bucket.total += 1;
    if (check.status === "up") bucket.up += 1;
    buckets.set(key, bucket);
  }
  return Array.from(buckets, ([label, bucket]) => ({
    label,
    uptimePct: bucket.total > 0 ? (bucket.up / bucket.total) * 100 : 100,
    checks: bucket.total,
  })).slice(-6);
}
