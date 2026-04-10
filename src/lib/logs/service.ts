import { and, desc, eq, gte, ilike, inArray, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, monitorEvents, monitors } from "@/lib/db/schema";
import type { LogLevel } from "@/lib/logs/types";

function mapEventToLevel(eventType: string, status: string | null): LogLevel {
  if (eventType === "check") return "info";
  if (eventType === "failure") return "critical";
  if (eventType === "ssl-expiry" || eventType === "latency" || eventType === "status-change") return "warning";
  if (eventType === "recovery") return "info";
  if (status === "down") return "error";
  return "info";
}

export async function listLogs(
  userId: string,
  filters: {
    search?: string;
    level?: string;
    companyQuery?: string;
    monitorQuery?: string;
    from?: string;
    to?: string;
    statusCode?: string;
    page?: number;
    pageSize?: number;
  }
) {
  const conditions = [eq(monitorEvents.userId, userId)];
  const monitorConditions = [eq(monitors.userId, userId)];

  if (filters.from) {
    const fromDate = new Date(filters.from);
    conditions.push(gte(monitorEvents.createdAt, fromDate));
    monitorConditions.push(
      or(gte(monitors.lastCheckedAt, fromDate), gte(monitors.lastSuccessAt, fromDate))!
    );
  }

  if (filters.to) {
    const end = new Date(filters.to);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(monitorEvents.createdAt, end));
  }

  if (filters.companyQuery?.trim()) {
    conditions.push(ilike(companies.name, `%${filters.companyQuery.trim()}%`));
    monitorConditions.push(ilike(companies.name, `%${filters.companyQuery.trim()}%`));
  }

  if (filters.monitorQuery?.trim()) {
    conditions.push(ilike(monitors.name, `%${filters.monitorQuery.trim()}%`));
    monitorConditions.push(ilike(monitors.name, `%${filters.monitorQuery.trim()}%`));
  }

  if (filters.search?.trim()) {
    const query = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(monitorEvents.message, query),
        ilike(monitorEvents.rcaTitle, query),
        ilike(monitorEvents.rcaSummary, query),
        ilike(monitors.name, query),
        ilike(companies.name, query)
      )!
    );
    monitorConditions.push(
      or(
        ilike(monitors.name, query),
        ilike(monitors.url, query),
        ilike(companies.name, query),
        ilike(monitors.lastErrorMessage, query)
      )!
    );
  }

  if (filters.statusCode?.trim()) {
    const parsed = Number(filters.statusCode);
    if (Number.isFinite(parsed)) {
      conditions.push(eq(monitorEvents.statusCode, parsed));
      monitorConditions.push(eq(monitors.statusCode, parsed));
    }
  }

  appendLevelConditions(conditions, filters.level);
  appendMonitorLevelConditions(monitorConditions, filters.level);

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 10));
  const offset = (page - 1) * pageSize;
  const [eventRows, monitorRows] = await Promise.all([
    db
    .select({
      id: monitorEvents.id,
      createdAt: monitorEvents.createdAt,
      eventType: monitorEvents.eventType,
      message: monitorEvents.message,
      status: monitorEvents.status,
      statusCode: monitorEvents.statusCode,
      latencyMs: monitorEvents.latencyMs,
      rcaType: monitorEvents.rcaType,
      rcaTitle: monitorEvents.rcaTitle,
      rcaSummary: monitorEvents.rcaSummary,
      companyId: monitors.companyId,
      companyName: companies.name,
      monitorId: monitors.id,
      monitorName: monitors.name,
    })
    .from(monitorEvents)
    .leftJoin(monitors, eq(monitorEvents.monitorId, monitors.id))
    .leftJoin(companies, eq(monitors.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(desc(monitorEvents.createdAt)),
    db
      .select({
        id: monitors.id,
        createdAt: monitors.lastCheckedAt,
        eventType: monitors.status,
        message: monitors.lastErrorMessage,
        status: monitors.status,
        statusCode: monitors.statusCode,
        latencyMs: monitors.latencyMs,
        companyId: monitors.companyId,
        companyName: companies.name,
        monitorId: monitors.id,
        monitorName: monitors.name,
        url: monitors.url,
        lastCheckedAt: monitors.lastCheckedAt,
        lastSuccessAt: monitors.lastSuccessAt,
        lastFailureAt: monitors.lastFailureAt,
      })
      .from(monitors)
      .leftJoin(companies, eq(monitors.companyId, companies.id))
      .where(and(...monitorConditions))
      .orderBy(desc(monitors.lastCheckedAt))
      .limit(500),
  ]);

  const summaryRows = monitorRows
    .filter((row) => row.status === "up" && row.createdAt)
    .map((row) => buildUpSummaryRow(row));

  const rows = [...summaryRows, ...eventRows.filter((row) => row.eventType !== "check")]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const pagedRows = rows.slice(offset, offset + pageSize);

  const totalRows = rows.length;

  return {
    rows: pagedRows.map((row) => mapLogRow(row)),
    total: totalRows,
    page,
    pageSize,
  };
}

export async function getLogFilterOptions(userId: string) {
  const [companyRows, monitorRows] = await Promise.all([
    db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.userId, userId)),
    db
      .select({ id: monitors.id, name: monitors.name, companyId: monitors.companyId })
      .from(monitors)
      .where(eq(monitors.userId, userId)),
  ]);

  return {
    companies: companyRows,
    monitors: monitorRows,
  };
}

export async function clearLogs(userId: string) {
  return db.delete(monitorEvents).where(eq(monitorEvents.userId, userId)).returning({ id: monitorEvents.id });
}

function appendLevelConditions(conditions: unknown[], level?: string) {
  if (!level || level === "all") {
    return;
  }

  if (level === "critical") {
    conditions.push(eq(monitorEvents.eventType, "failure"));
    return;
  }

  if (level === "warning") {
    conditions.push(inArray(monitorEvents.eventType, ["ssl-expiry", "latency", "status-change"]));
    return;
  }

  if (level === "info") {
    conditions.push(inArray(monitorEvents.eventType, ["check", "recovery"]));
    return;
  }

  conditions.push(and(eq(monitorEvents.status, "down"), ilike(monitorEvents.eventType, "%"))!);
}

function appendMonitorLevelConditions(conditions: unknown[], level?: string) {
  if (!level || level === "all" || level === "info") {
    return;
  }

  if (level === "critical" || level === "error" || level === "warning") {
    conditions.push(eq(monitors.status, "down"));
  }
}

function buildUpSummaryRow(row: {
  id: string;
  createdAt: Date | null;
  eventType: string;
  message: string | null;
  status: string;
  statusCode: number | null;
  latencyMs: number | null;
  companyId: string | null;
  companyName: string | null;
  monitorId: string;
  monitorName: string;
  url: string;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
}) {
  const upSince = resolveUpSince(row.lastSuccessAt, row.lastFailureAt, row.createdAt);

  return {
    id: `up-summary:${row.id}`,
    createdAt: row.createdAt ?? new Date(0),
    eventType: "up-summary",
    message: "Monitor is healthy.",
    status: "up",
    statusCode: row.statusCode,
    latencyMs: row.latencyMs,
    rcaType: null,
    rcaTitle: "Healthy state",
    rcaSummary: null,
    companyId: row.companyId,
    companyName: row.companyName,
    monitorId: row.monitorId,
    monitorName: row.monitorName,
    detailTitle: "Current uptime window",
    detailSummary: `This monitor has remained healthy since ${upSince.toLocaleString()}.`,
    detailItems: [
      { label: "Up since", value: upSince.toLocaleString() },
      { label: "Healthy for", value: formatDuration(Date.now() - upSince.getTime()) },
      { label: "Last check", value: row.lastCheckedAt?.toLocaleString() ?? "Never checked" },
      { label: "Current code", value: row.statusCode ? `HTTP ${row.statusCode}` : "No status code" },
      { label: "Latest latency", value: row.latencyMs !== null ? `${row.latencyMs}ms` : "No latency sample" },
      { label: "Target", value: row.url },
    ],
  };
}

function mapLogRow(row: {
  id: string;
  createdAt: Date;
  eventType: string;
  message: string | null;
  status: string | null;
  statusCode: number | null;
  latencyMs?: number | null;
  rcaType?: string | null;
  rcaTitle?: string | null;
  rcaSummary?: string | null;
  companyId: string | null;
  companyName: string | null;
  monitorId: string | null;
  monitorName: string | null;
  detailTitle?: string | null;
  detailSummary?: string | null;
  detailItems?: Array<{ label: string; value: string }>;
}) {
  return {
    ...row,
    level: row.eventType === "up-summary" ? "info" : mapEventToLevel(row.eventType, row.status),
    detailTitle: row.detailTitle ?? row.rcaTitle ?? null,
    detailSummary: row.detailSummary ?? row.rcaSummary ?? row.message,
    detailItems:
      row.detailItems ??
      compactDetailItems([
        { label: "Event type", value: row.eventType },
        row.status ? { label: "Status", value: row.status.toUpperCase() } : null,
        row.statusCode ? { label: "Status code", value: `HTTP ${row.statusCode}` } : null,
        row.latencyMs !== null && row.latencyMs !== undefined
          ? { label: "Latency", value: `${row.latencyMs}ms` }
          : null,
        row.rcaType ? { label: "RCA type", value: row.rcaType } : null,
      ]),
  };
}

function compactDetailItems(items: Array<{ label: string; value: string } | null>) {
  return items.filter((item): item is { label: string; value: string } => Boolean(item));
}

function resolveUpSince(lastSuccessAt: Date | null, lastFailureAt: Date | null, fallback: Date | null) {
  if (lastSuccessAt && lastFailureAt && lastSuccessAt > lastFailureAt) {
    return lastSuccessAt;
  }

  return lastSuccessAt ?? fallback ?? new Date();
}

function formatDuration(durationMs: number) {
  const totalMinutes = Math.max(1, Math.floor(durationMs / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}
