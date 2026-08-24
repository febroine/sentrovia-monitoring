import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { getCompanyById } from "@/lib/companies/service";
import { db } from "@/lib/db";
import { monitorChecks, monitorDiagnostics, monitors, outageEvents } from "@/lib/db/schema";
import { getMonitorSlaPeriods } from "@/lib/monitoring/sla-service";

const MAX_MONITORS_WITH_RECENT_ROWS = 500;

export async function listRecentMonitorChecks(userId: string, limitPerMonitor = 12) {
  const rows = await db
    .select()
    .from(monitorChecks)
    .where(eq(monitorChecks.userId, userId))
    .orderBy(desc(monitorChecks.createdAt))
    .limit(normalizeRecentRowLimit(limitPerMonitor));

  return groupRecentRowsByMonitor(rows, limitPerMonitor);
}

export async function listRecentMonitorDiagnostics(userId: string, limitPerMonitor = 3) {
  const rows = await db
    .select()
    .from(monitorDiagnostics)
    .where(eq(monitorDiagnostics.userId, userId))
    .orderBy(desc(monitorDiagnostics.createdAt))
    .limit(normalizeRecentRowLimit(limitPerMonitor));

  return groupRecentRowsByMonitor(rows, limitPerMonitor);
}

export async function listRecentOutageEvents(userId: string, limitPerMonitor = 8) {
  const rows = await db
    .select()
    .from(outageEvents)
    .where(eq(outageEvents.userId, userId))
    .orderBy(desc(outageEvents.createdAt))
    .limit(normalizeRecentRowLimit(limitPerMonitor));

  return groupRecentRowsByMonitor(rows, limitPerMonitor);
}

export async function getCompanySlaReport(userId: string, companyId: string) {
  const company = await getCompanyById(userId, companyId);
  if (!company) return null;

  const companyMonitors = await db
    .select({ id: monitors.id, status: monitors.status })
    .from(monitors)
    .where(and(
      eq(monitors.userId, userId),
      eq(monitors.companyId, companyId),
      eq(monitors.isActive, true),
      isNull(monitors.deletedAt)
    ));
  const monitorIds = companyMonitors.map((monitor) => monitor.id);
  const [periods, recentChecks] = await Promise.all([
    getMonitorSlaPeriods(userId, monitorIds),
    monitorIds.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(monitorChecks)
          .where(and(eq(monitorChecks.userId, userId), inArray(monitorChecks.monitorId, monitorIds)))
          .orderBy(desc(monitorChecks.createdAt))
          .limit(500),
  ]);
  const { averageLatencyMs, statusCodes } = summarizeCompanyRecentChecks(recentChecks);

  return {
    companyId: company.id,
    companyName: company.name,
    monitorCount: companyMonitors.length,
    activeCount: companyMonitors.filter((monitor) => monitor.status === "up").length,
    averageLatencyMs,
    periods,
    statusCodes,
  };
}

export async function getCompanyMonthlyUptimeReport(userId: string, companyId: string) {
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

  const since = new Date();
  since.setMonth(since.getMonth() - 5);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);
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

export function summarizeCompanyRecentChecks(
  checks: Array<{ status: string; statusCode: number | null; latencyMs: number | null }>
) {
  const completedChecks = checks.filter((check) => check.status !== "pending");
  const latencyValues = completedChecks.map((check) => check.latencyMs).filter(isNumber);
  const statusCodes = buildStatusCodeSummary(completedChecks);
  return { averageLatencyMs: averageValue(latencyValues), statusCodes };
}

function normalizeRecentRowLimit(limitPerMonitor: number) {
  return Math.max(limitPerMonitor, 1) * MAX_MONITORS_WITH_RECENT_ROWS;
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
