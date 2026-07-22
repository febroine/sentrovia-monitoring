import { and, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, ne, notInArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, monitorEvents, monitors } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/errors";
import type { LogLevel } from "@/lib/logs/types";
import { NOTIFICATION_MARKER_EVENT_TYPES } from "@/lib/monitors/event-types";
import { toEnglishUppercase } from "@/lib/text/casing";

const HIDDEN_NOTIFICATION_MARKER_EVENTS: string[] = [...NOTIFICATION_MARKER_EVENT_TYPES];
const WORKER_NOTIFICATION_MARKER_EVENTS: string[] = [...HIDDEN_NOTIFICATION_MARKER_EVENTS];
const WARNING_EVENT_TYPES = ["ssl-expiry", "latency", "status-change"];
const NON_ERROR_EVENT_TYPES = ["failure", "recovery", "check", ...WARNING_EVENT_TYPES];
const LOG_LEVEL_FILTERS = new Set(["all", "info", "warning", "error", "critical"]);

export function mapEventToLevel(eventType: string, status: string | null): LogLevel {
  if (eventType === "check") return "info";
  if (eventType === "failure") return "critical";
  if (WARNING_EVENT_TYPES.includes(eventType)) return "warning";
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
  const conditions = [
    eq(monitorEvents.userId, userId),
    ne(monitorEvents.eventType, "check"),
    notInArray(monitorEvents.eventType, HIDDEN_NOTIFICATION_MARKER_EVENTS),
  ];
  const monitorConditions = [eq(monitors.userId, userId), isNull(monitors.deletedAt)];

  const fromDate = parseDateFilter(filters.from);
  const toDate = parseDateFilter(filters.to);
  if (fromDate && toDate && fromDate > toDate) {
    throw new AuthError("The log start date must not be after the end date.", 400);
  }

  if (fromDate) {
    conditions.push(gte(monitorEvents.createdAt, fromDate));
    monitorConditions.push(gte(monitors.lastCheckedAt, fromDate));
  }

  if (toDate) {
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(monitorEvents.createdAt, end));
    monitorConditions.push(lte(monitors.lastCheckedAt, end));
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
    if (!Number.isInteger(parsed) || parsed < 100 || parsed > 599) {
      throw new AuthError("Enter a valid HTTP status code between 100 and 599.", 400);
    }
    conditions.push(eq(monitorEvents.statusCode, parsed));
    monitorConditions.push(eq(monitors.statusCode, parsed));
  }

  appendLevelConditions(conditions, filters.level);
  appendMonitorLevelConditions(monitorConditions, filters.level);

  const page = toBoundedInteger(filters.page, 1, 1);
  const pageSize = toBoundedInteger(filters.pageSize, 10, 10, 100);
  const offset = (page - 1) * pageSize;
  const requiredRows = offset + pageSize;
  const upSummaryConditions = [
    ...monitorConditions,
    eq(monitors.status, "up"),
    isNotNull(monitors.lastCheckedAt),
  ];
  const [eventRows, monitorRows, eventCountRows, monitorCountRows] = await Promise.all([
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
    .orderBy(desc(monitorEvents.createdAt))
    .limit(requiredRows),
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
      .where(and(...upSummaryConditions))
      .orderBy(desc(monitors.lastCheckedAt))
      .limit(requiredRows),
    db
      .select({ total: count() })
      .from(monitorEvents)
      .leftJoin(monitors, eq(monitorEvents.monitorId, monitors.id))
      .leftJoin(companies, eq(monitors.companyId, companies.id))
      .where(and(...conditions)),
    db
      .select({ total: count() })
      .from(monitors)
      .leftJoin(companies, eq(monitors.companyId, companies.id))
      .where(and(...upSummaryConditions)),
  ]);

  const summaryRows = monitorRows.map((row) => buildUpSummaryRow(row));

  const rows = [...summaryRows, ...eventRows]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const pagedRows = rows.slice(offset, offset + pageSize);

  const totalRows = Number(eventCountRows[0]?.total ?? 0) + Number(monitorCountRows[0]?.total ?? 0);

  return {
    rows: pagedRows.map((row) => mapLogRow(row)),
    total: totalRows,
    page,
    pageSize,
  };
}

export function parseDateFilter(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const normalized = value.trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? parseLocalDateInput(normalized)
    : new Date(normalized);
  if (!parsed || Number.isNaN(parsed.getTime())) {
    throw new AuthError("Enter a valid log date.", 400);
  }

  return parsed;
}

function parseLocalDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return parsed.getFullYear() === Number(year)
    && parsed.getMonth() === Number(month) - 1
    && parsed.getDate() === Number(day)
    ? parsed
    : null;
}

function toBoundedInteger(value: number | undefined, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  const parsed = Math.trunc(value);
  return Math.min(max, Math.max(min, parsed));
}

export async function getLogFilterOptions(userId: string) {
  const [companyRows, monitorRows] = await Promise.all([
    db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(and(eq(companies.userId, userId), isNull(companies.deletedAt))),
    db
      .select({ id: monitors.id, name: monitors.name, companyId: monitors.companyId })
      .from(monitors)
      .where(and(eq(monitors.userId, userId), isNull(monitors.deletedAt))),
  ]);

  return {
    companies: companyRows,
    monitors: monitorRows,
  };
}

export async function clearLogs(userId: string) {
  return db
    .delete(monitorEvents)
    .where(
      and(
        eq(monitorEvents.userId, userId),
        notInArray(monitorEvents.eventType, WORKER_NOTIFICATION_MARKER_EVENTS)
      )
    )
    .returning({ id: monitorEvents.id });
}

function appendLevelConditions(conditions: unknown[], level?: string) {
  if (!level || level === "all" || !LOG_LEVEL_FILTERS.has(level)) {
    return;
  }

  if (level === "critical") {
    conditions.push(eq(monitorEvents.eventType, "failure"));
    return;
  }

  if (level === "warning") {
    conditions.push(inArray(monitorEvents.eventType, WARNING_EVENT_TYPES));
    return;
  }

  if (level === "info") {
    conditions.push(inArray(monitorEvents.eventType, ["check", "recovery"]));
    return;
  }

  conditions.push(
    and(
      eq(monitorEvents.status, "down"),
      notInArray(monitorEvents.eventType, NON_ERROR_EVENT_TYPES)
    )!
  );
}

function appendMonitorLevelConditions(conditions: unknown[], level?: string) {
  if (!level || level === "all" || level === "info" || !LOG_LEVEL_FILTERS.has(level)) {
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
  const latestSuccessfulCheck = row.lastSuccessAt ?? row.createdAt ?? new Date(0);

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
    detailTitle: "Latest healthy check",
    detailSummary: `The latest successful check completed at ${latestSuccessfulCheck.toLocaleString()}.`,
    detailItems: [
      { label: "Latest successful check", value: latestSuccessfulCheck.toLocaleString() },
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
        row.status ? { label: "Status", value: toEnglishUppercase(row.status) } : null,
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
