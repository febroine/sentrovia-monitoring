import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getCompanyById } from "@/lib/companies/service";
import { db, type DatabaseExecutor } from "@/lib/db";
import { monitorChecks, monitorEvents, monitors, userSettings, workerState } from "@/lib/db/schema";
import { env } from "@/lib/env";
import type { MonitorInput } from "@/lib/monitors/schemas";
import {
  buildCanonicalMonitorTarget,
  buildMonitorIdentityKey,
  parseHeartbeatMonitorTarget,
  parsePingMonitorTarget,
  parsePortMonitorTarget,
  parsePostgresMonitorTarget,
} from "@/lib/monitors/targets";
import { intervalToMs } from "@/lib/monitors/utils";
import { encryptValue } from "@/lib/security/encryption";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";

const WORKER_STATE_ID = "primary";
const MONITOR_LEASE_MS = Math.max(env.workerPollIntervalMs * 6, 180_000);
const MAX_COLD_START_SPREAD_MS = 5 * 60_000;

export async function listMonitors(userId: string) {
  return db
    .select()
    .from(monitors)
    .where(eq(monitors.userId, userId))
    .orderBy(desc(monitors.createdAt));
}

export async function createMonitor(userId: string, input: MonitorInput) {
  const values = await buildMonitorValues(userId, input, null);
  const [monitor] = await db
    .insert(monitors)
    .values(values)
    .returning();

  return monitor;
}

export async function updateMonitor(userId: string, monitorId: string, input: MonitorInput) {
  const existingMonitor = await getMonitorById(userId, monitorId);
  if (!existingMonitor) {
    return null;
  }

  const values = await buildMonitorValues(userId, input, existingMonitor);
  const [monitor] = await db
    .update(monitors)
    .set({
      ...values,
      userId,
      updatedAt: new Date(),
    })
    .where(and(eq(monitors.id, monitorId), eq(monitors.userId, userId)))
    .returning();

  return monitor;
}

export async function bulkUpdateMonitors(userId: string, ids: string[], input: MonitorInput) {
  return db.transaction(async (tx) => {
    const existingMonitors = await tx
      .select()
      .from(monitors)
      .where(and(eq(monitors.userId, userId), inArray(monitors.id, ids)));
    const updated: Array<typeof monitors.$inferSelect> = [];

    for (const existingMonitor of existingMonitors) {
      const mergedInput = buildBulkUpdatePayload(existingMonitor, input);
      const values = await buildMonitorValues(userId, mergedInput, existingMonitor, tx);
      const [monitor] = await tx
        .update(monitors)
        .set({
          ...values,
          userId,
          updatedAt: new Date(),
        })
        .where(and(eq(monitors.id, existingMonitor.id), eq(monitors.userId, userId)))
        .returning();

      if (monitor) {
        updated.push(monitor);
      }
    }

    return updated;
  });
}

export async function updateMonitorTags(
  userId: string,
  ids: string[],
  action: "add" | "remove" | "replace",
  tags: string[]
) {
  const current = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.userId, userId), inArray(monitors.id, ids)));

  const normalizedTags = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
  const updated = await Promise.all(
    current.map(async (monitor) => {
      const nextTags = resolveTagPatch(monitor.tags, normalizedTags, action);
      const [item] = await db
        .update(monitors)
        .set({
          tags: nextTags,
          updatedAt: new Date(),
        })
        .where(eq(monitors.id, monitor.id))
        .returning();

      return item;
    })
  );

  return updated;
}

export async function deleteMonitors(userId: string, ids: string[]) {
  return db
    .delete(monitors)
    .where(and(eq(monitors.userId, userId), inArray(monitors.id, ids)))
    .returning({ id: monitors.id });
}

export async function createManyMonitors(userId: string, inputs: MonitorInput[], database: DatabaseExecutor = db) {
  const existing = await database
    .select({ monitorType: monitors.monitorType, url: monitors.url })
    .from(monitors)
    .where(eq(monitors.userId, userId));

  const existingTargets = new Set(
    existing.map((item) =>
      buildMonitorIdentityKey({
        monitorType: normalizeMonitorType(item.monitorType),
        url: item.url,
      })
    )
  );
  const seenTargets = new Set(existingTargets);
  const filtered = inputs.filter((input) => {
    const url = buildCanonicalMonitorTarget(input);
    const key = buildMonitorIdentityKey({ monitorType: input.monitorType, url });
    if (seenTargets.has(key)) {
      return false;
    }

    seenTargets.add(key);
    return true;
  });
  const values = await Promise.all(filtered.map((input) => buildMonitorValues(userId, input, null, database)));
  const valuesWithInitialSchedule = spreadInitialMonitorChecks(values, new Date());

  if (valuesWithInitialSchedule.length === 0) {
    return [];
  }

  return database.insert(monitors).values(valuesWithInitialSchedule).returning();
}

export function spreadInitialMonitorChecks<T extends { intervalValue: number; intervalUnit: string }>(
  values: T[],
  now = new Date()
) {
  if (values.length === 0) {
    return [];
  }

  const spreadWindowMs = resolveColdStartSpreadWindow(values);

  return values.map((value, index) => ({
    ...value,
    nextCheckAt: new Date(now.getTime() + Math.floor((spreadWindowMs * index) / values.length)),
  }));
}

function resolveColdStartSpreadWindow(values: Array<{ intervalValue: number; intervalUnit: string }>) {
  const shortestIntervalMs = Math.min(
    ...values.map((value) => intervalToMs(value.intervalValue, value.intervalUnit))
  );

  return Math.max(0, Math.min(shortestIntervalMs, MAX_COLD_START_SPREAD_MS));
}

export async function claimDueMonitors(now: Date) {
  const dueRows = await db
    .select()
    .from(monitors)
    .where(
      and(
        eq(monitors.isActive, true),
        or(lte(monitors.nextCheckAt, now), isNull(monitors.nextCheckAt)),
        or(lte(monitors.leaseExpiresAt, now), isNull(monitors.leaseExpiresAt))
      )
    )
    .orderBy(asc(monitors.nextCheckAt), asc(monitors.createdAt));

  if (dueRows.length === 0) {
    return [];
  }

  const userIds = Array.from(new Set(dueRows.map((monitor) => monitor.userId)));
  const settingsRows = await db
    .select({ userId: userSettings.userId, batchSize: userSettings.monitoringBatchSize })
    .from(userSettings)
    .where(inArray(userSettings.userId, userIds));

  const batchSizeMap = new Map(
    settingsRows.map((item) => [item.userId, item.batchSize ?? DEFAULT_SETTINGS.monitoring.batchSize])
  );
  const selectedRows = selectDueMonitorsForCycle(dueRows, batchSizeMap);

  if (selectedRows.length === 0) {
    return [];
  }

  const leaseToken = crypto.randomUUID();
  return db
    .update(monitors)
    .set({
      leaseToken,
      leaseExpiresAt: new Date(now.getTime() + MONITOR_LEASE_MS),
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(
          monitors.id,
          selectedRows.map((monitor) => monitor.id)
        ),
        eq(monitors.isActive, true),
        or(lte(monitors.nextCheckAt, now), isNull(monitors.nextCheckAt)),
        or(lte(monitors.leaseExpiresAt, now), isNull(monitors.leaseExpiresAt))
      )
    )
    .returning();
}

export async function countDueMonitors(now: Date) {
  const rows = await db
    .select({ id: monitors.id })
    .from(monitors)
    .where(
      and(
        eq(monitors.isActive, true),
        or(lte(monitors.nextCheckAt, now), isNull(monitors.nextCheckAt)),
        or(lte(monitors.leaseExpiresAt, now), isNull(monitors.leaseExpiresAt))
      )
    );

  return rows.length;
}

export async function recordMonitorResult(
  monitorId: string,
  update: {
    status: string;
    statusCode: number | null;
    uptime: string;
    lastCheckedAt: Date;
    nextCheckAt: Date;
    lastSuccessAt?: Date | null;
    lastFailureAt?: Date | null;
    sslExpiresAt?: Date | null;
    lastErrorMessage?: string | null;
    consecutiveFailures: number;
    verificationMode: boolean;
    verificationFailureCount: number;
    latencyMs?: number | null;
  }
) {
  const [monitor] = await db
    .update(monitors)
    .set({
      ...update,
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(monitors.id, monitorId))
    .returning();

  return monitor;
}

export async function receiveHeartbeat(token: string, receivedAt = new Date()) {
  const [monitor] = await db
    .update(monitors)
    .set({
      heartbeatLastReceivedAt: receivedAt,
      nextCheckAt: receivedAt,
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(monitors.monitorType, "heartbeat"), eq(monitors.heartbeatToken, token)))
    .returning();

  if (!monitor) {
    return null;
  }

  await appendMonitorEvent({
    monitorId: monitor.id,
    userId: monitor.userId,
    eventType: "heartbeat-received",
    status: monitor.status,
    statusCode: monitor.statusCode,
    latencyMs: null,
    message: "Heartbeat ping received from the external job.",
  });

  return monitor;
}

export async function appendMonitorEvent(input: {
  monitorId: string;
  userId: string;
  eventType: string;
  status?: string | null;
  statusCode?: number | null;
  latencyMs?: number | null;
  message?: string | null;
  rcaType?: string | null;
  rcaTitle?: string | null;
  rcaSummary?: string | null;
}) {
  await db.insert(monitorEvents).values({
    monitorId: input.monitorId,
    userId: input.userId,
    eventType: input.eventType,
    status: input.status ?? null,
    statusCode: input.statusCode ?? null,
    latencyMs: input.latencyMs ?? null,
    message: input.message ?? null,
    rcaType: input.rcaType ?? null,
    rcaTitle: input.rcaTitle ?? null,
    rcaSummary: input.rcaSummary ?? null,
  });
}

export async function hasRecentMonitorEvent(input: {
  monitorId: string;
  eventType: string;
  since: Date;
  before: Date;
}) {
  const [event] = await db
    .select({ id: monitorEvents.id })
    .from(monitorEvents)
    .where(
      and(
        eq(monitorEvents.monitorId, input.monitorId),
        eq(monitorEvents.eventType, input.eventType),
        gte(monitorEvents.createdAt, input.since),
        lte(monitorEvents.createdAt, input.before)
      )
    )
    .orderBy(desc(monitorEvents.createdAt))
    .limit(1);

  return Boolean(event);
}

export async function appendMonitorCheck(input: {
  monitorId: string;
  userId: string;
  status: "up" | "down" | "pending";
  statusCode?: number | null;
  latencyMs?: number | null;
  createdAt: Date;
}) {
  await db.insert(monitorChecks).values({
    monitorId: input.monitorId,
    userId: input.userId,
    status: input.status,
    statusCode: input.statusCode ?? null,
    latencyMs: input.latencyMs ?? null,
    createdAt: input.createdAt,
  });
}

export async function listRecentMonitorChecks(userId: string, limitPerMonitor = 12) {
  const rows = await db
    .select()
    .from(monitorChecks)
    .where(eq(monitorChecks.userId, userId))
    .orderBy(desc(monitorChecks.createdAt))
    .limit(Math.max(limitPerMonitor, 1) * 500);

  const grouped = new Map<string, typeof rows>();

  for (const row of rows) {
    const current = grouped.get(row.monitorId) ?? [];
    if (current.length >= limitPerMonitor) {
      continue;
    }

    current.push(row);
    grouped.set(row.monitorId, current);
  }

  return Object.fromEntries(
    Array.from(grouped.entries()).map(([monitorId, checks]) => [monitorId, checks.reverse()])
  );
}

export async function getCompanySlaReport(userId: string, companyId: string) {
  const company = await getCompanyById(userId, companyId);
  if (!company) {
    return null;
  }

  const companyMonitors = await db
    .select({
      id: monitors.id,
      status: monitors.status,
    })
    .from(monitors)
    .where(and(eq(monitors.userId, userId), eq(monitors.companyId, companyId)));

  const monitorIds = companyMonitors.map((monitor) => monitor.id);
  const windows = [
    { label: "24h SLA", since: new Date(Date.now() - 1000 * 60 * 60 * 24) },
    { label: "7d SLA", since: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7) },
  ];

  const checks =
    monitorIds.length === 0
      ? []
      : await db
          .select()
          .from(monitorChecks)
          .where(and(eq(monitorChecks.userId, userId), inArray(monitorChecks.monitorId, monitorIds)))
          .orderBy(desc(monitorChecks.createdAt))
          .limit(4000);

  const periods = windows.map((window) => summarizeChecks(window.label, checks, window.since));
  const recentChecks = checks.filter((check) => check.statusCode !== null).slice(0, 500);
  const averageLatencyMs = averageValue(recentChecks.map((check) => check.latencyMs).filter(isNumber));
  const statusCodes = buildStatusCodeSummary(recentChecks);

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
  if (!company) {
    return null;
  }

  const companyMonitors = await db
    .select({ id: monitors.id })
    .from(monitors)
    .where(and(eq(monitors.userId, userId), eq(monitors.companyId, companyId)));
  const monitorIds = companyMonitors.map((monitor) => monitor.id);

  if (monitorIds.length === 0) {
    return {
      companyId: company.id,
      companyName: company.name,
      months: [],
    };
  }

  const since = new Date();
  since.setMonth(since.getMonth() - 5);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const checks = await db
    .select({
      status: monitorChecks.status,
      createdAt: monitorChecks.createdAt,
    })
    .from(monitorChecks)
    .where(
      and(
        eq(monitorChecks.userId, userId),
        inArray(monitorChecks.monitorId, monitorIds),
        gte(monitorChecks.createdAt, since)
      )
    )
    .orderBy(asc(monitorChecks.createdAt));

  const months = buildMonthlyUptime(checks);

  return {
    companyId: company.id,
    companyName: company.name,
    months,
  };
}

export async function getWorkerState() {
  const [state] = await db.select().from(workerState).where(eq(workerState.id, WORKER_STATE_ID));

  if (state) {
    return state;
  }

  const [created] = await db
    .insert(workerState)
    .values({ id: WORKER_STATE_ID, desiredState: "stopped", running: false })
    .returning();

  return created;
}

export async function updateWorkerState(values: Partial<typeof workerState.$inferInsert>) {
  await getWorkerState();

  const [state] = await db
    .update(workerState)
    .set({
      ...values,
      updatedAt: new Date(),
    })
    .where(eq(workerState.id, WORKER_STATE_ID))
    .returning();

  return state;
}

export async function incrementWorkerCheckedCount(amount = 1) {
  await getWorkerState();

  const increment = Math.max(0, amount);
  const [state] = await db
    .update(workerState)
    .set({
      checkedCount: sql`${workerState.checkedCount} + ${increment}`,
      updatedAt: new Date(),
    })
    .where(eq(workerState.id, WORKER_STATE_ID))
    .returning();

  return state;
}

async function buildMonitorValues(
  userId: string,
  input: MonitorInput,
  existingMonitor: typeof monitors.$inferSelect | null,
  database: DatabaseExecutor = db
) {
  const companyRecord =
    input.companyId && input.companyId.length > 0 ? await getCompanyById(userId, input.companyId, database) : null;
  const monitorType = normalizeMonitorType(input.monitorType);
  const heartbeatToken =
    monitorType === "heartbeat" ? resolveHeartbeatToken(input, existingMonitor) : null;
  const url = buildCanonicalMonitorTarget({
    ...input,
    heartbeatToken: heartbeatToken ?? input.heartbeatToken,
  });
  const databasePasswordEncrypted =
    monitorType === "postgres"
      ? resolveDatabasePassword(input, existingMonitor)
      : null;

  return {
    userId,
    name: input.name,
    monitorType,
    url,
    companyId: companyRecord?.id ?? null,
    company: companyRecord?.name ?? input.company,
    notificationPref: input.notificationPref,
    notifEmail: input.notifEmail,
    telegramBotToken: input.telegramBotToken,
    telegramChatId: input.telegramChatId,
    heartbeatToken,
    heartbeatLastReceivedAt:
      monitorType === "heartbeat" ? existingMonitor?.heartbeatLastReceivedAt ?? null : null,
    intervalValue: input.intervalValue,
    intervalUnit: input.intervalUnit,
    timeout: input.timeout,
    retries: input.retries,
    method: monitorType === "port" || monitorType === "postgres" || monitorType === "ping" || monitorType === "heartbeat" ? "GET" : input.method,
    databaseSsl: monitorType === "postgres" ? input.databaseSsl : true,
    databasePasswordEncrypted,
    keywordQuery: monitorType === "keyword" ? input.keywordQuery.trim() : null,
    keywordInvert: monitorType === "keyword" ? input.keywordInvert : false,
    jsonPath: monitorType === "json" ? input.jsonPath.trim() : null,
    jsonExpectedValue: monitorType === "json" ? input.jsonExpectedValue.trim() : null,
    jsonMatchMode: monitorType === "json" ? input.jsonMatchMode : "equals",
    tags: input.tags,
    renotifyCount: input.renotifyCount,
    maxRedirects: monitorType === "port" || monitorType === "postgres" || monitorType === "ping" || monitorType === "heartbeat" ? 0 : input.maxRedirects,
    ipFamily: monitorType === "postgres" || monitorType === "heartbeat" ? "auto" : input.ipFamily,
    checkSslExpiry: monitorType === "http" || monitorType === "keyword" || monitorType === "json" ? input.checkSslExpiry : false,
    ignoreSslErrors: monitorType === "http" || monitorType === "keyword" || monitorType === "json" ? input.ignoreSslErrors : false,
    cacheBuster: monitorType === "http" || monitorType === "keyword" || monitorType === "json" ? input.cacheBuster : false,
    saveErrorPages: monitorType === "http" || monitorType === "keyword" || monitorType === "json" ? input.saveErrorPages : false,
    saveSuccessPages: monitorType === "http" || monitorType === "keyword" || monitorType === "json" ? input.saveSuccessPages : false,
    responseMaxLength: monitorType === "port" || monitorType === "postgres" || monitorType === "ping" || monitorType === "heartbeat" ? 0 : input.responseMaxLength,
    telegramTemplate: input.telegramTemplate,
    emailSubject: input.emailSubject,
    emailBody: input.emailBody,
    sendIncidentScreenshot: false,
    isActive: input.isActive,
    verificationMode: false,
    verificationFailureCount: 0,
  };
}

async function getMonitorById(userId: string, monitorId: string, database: DatabaseExecutor = db) {
  const [monitor] = await database
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, monitorId), eq(monitors.userId, userId)));

  return monitor ?? null;
}

export function selectDueMonitorsForCycle<T extends {
  userId: string;
  verificationMode: boolean;
  nextCheckAt: Date | null;
  createdAt: Date;
}>(dueRows: T[], batchSizeMap: Map<string, number>) {
  const counters = new Map<string, number>();

  return [...dueRows]
    .sort(compareDueMonitorPriority)
    .filter((monitor) => {
      const batchSize = Math.max(1, batchSizeMap.get(monitor.userId) ?? DEFAULT_SETTINGS.monitoring.batchSize);
      const current = counters.get(monitor.userId) ?? 0;

      if (current >= batchSize) {
        return false;
      }

      counters.set(monitor.userId, current + 1);
      return true;
    });
}

function compareDueMonitorPriority(
  left: { verificationMode: boolean; nextCheckAt: Date | null; createdAt: Date },
  right: { verificationMode: boolean; nextCheckAt: Date | null; createdAt: Date }
) {
  if (left.verificationMode !== right.verificationMode) {
    return left.verificationMode ? -1 : 1;
  }

  const nextCheckDiff = compareNullableDates(left.nextCheckAt, right.nextCheckAt);
  if (nextCheckDiff !== 0) {
    return nextCheckDiff;
  }

  return left.createdAt.getTime() - right.createdAt.getTime();
}

function compareNullableDates(left: Date | null, right: Date | null) {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return -1;
  }

  if (!right) {
    return 1;
  }

  return left.getTime() - right.getTime();
}

function buildBulkUpdatePayload(
  existingMonitor: typeof monitors.$inferSelect,
  input: MonitorInput
): MonitorInput {
  const monitorType = normalizeMonitorType(existingMonitor.monitorType);
  const payload: MonitorInput = {
    ...input,
    name: existingMonitor.name,
    monitorType,
    companyId: existingMonitor.companyId,
    company: existingMonitor.company,
    heartbeatLastReceivedAt: existingMonitor.heartbeatLastReceivedAt?.toISOString() ?? null,
    databasePassword: "",
    databasePasswordConfigured: Boolean(existingMonitor.databasePasswordEncrypted),
  };

  if (monitorType === "http" || monitorType === "keyword" || monitorType === "json") {
    payload.url = existingMonitor.url.split("#")[0];
  }

  if (monitorType === "keyword") {
    payload.keywordQuery = existingMonitor.keywordQuery ?? "";
    payload.keywordInvert = existingMonitor.keywordInvert;
  }

  if (monitorType === "json") {
    payload.jsonPath = existingMonitor.jsonPath ?? "";
    payload.jsonExpectedValue = existingMonitor.jsonExpectedValue ?? "";
    payload.jsonMatchMode = normalizeJsonMatchMode(existingMonitor.jsonMatchMode);
  }

  if (monitorType === "ping") {
    payload.portHost = parsePingMonitorTarget(existingMonitor.url).host;
  }

  if (monitorType === "port") {
    const target = parsePortMonitorTarget(existingMonitor.url);
    payload.portHost = target.host;
    payload.portNumber = target.port;
  }

  if (monitorType === "heartbeat") {
    payload.heartbeatToken =
      existingMonitor.heartbeatToken ?? parseHeartbeatMonitorTarget(existingMonitor.url).token;
  }

  if (monitorType === "postgres") {
    const target = parsePostgresMonitorTarget(existingMonitor.url);
    payload.databaseHost = target.host;
    payload.databasePort = target.port;
    payload.databaseName = target.databaseName;
    payload.databaseUsername = target.databaseUsername;
    payload.databaseSsl = existingMonitor.databaseSsl;
  }

  return payload;
}

function normalizeMonitorType(value: string | null | undefined): MonitorInput["monitorType"] {
  if (value === "port" || value === "postgres" || value === "keyword" || value === "json" || value === "ping" || value === "heartbeat") {
    return value;
  }

  return "http";
}

function normalizeJsonMatchMode(value: string | null | undefined): MonitorInput["jsonMatchMode"] {
  if (value === "contains" || value === "exists") {
    return value;
  }

  return "equals";
}

function resolveDatabasePassword(
  input: MonitorInput,
  existingMonitor: typeof monitors.$inferSelect | null
) {
  if (input.databasePassword.trim().length > 0) {
    return encryptValue(input.databasePassword.trim());
  }

  return existingMonitor?.databasePasswordEncrypted ?? null;
}

function resolveHeartbeatToken(
  input: MonitorInput,
  existingMonitor: typeof monitors.$inferSelect | null
) {
  if (existingMonitor?.heartbeatToken) {
    return existingMonitor.heartbeatToken;
  }

  if (input.heartbeatToken.trim().length >= 8) {
    return input.heartbeatToken.trim();
  }

  return crypto.randomUUID();
}

function summarizeChecks(label: string, checks: Array<typeof monitorChecks.$inferSelect>, since: Date) {
  const scoped = checks.filter((check) => check.createdAt >= since && check.status !== "pending");
  const totalChecks = scoped.length;
  const upChecks = scoped.filter((check) => check.status === "up").length;
  const incidents = scoped.filter((check) => check.status === "down").length;

  return {
    label,
    uptimePct: totalChecks > 0 ? (upChecks / totalChecks) * 100 : 100,
    incidents,
    totalChecks,
  };
}

function buildStatusCodeSummary(checks: Array<typeof monitorChecks.$inferSelect>) {
  const counts = new Map<number, number>();

  for (const check of checks) {
    if (typeof check.statusCode !== "number") {
      continue;
    }

    counts.set(check.statusCode, (counts.get(check.statusCode) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([statusCode, count]) => ({ statusCode, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
}

function averageValue(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isNumber(value: number | null): value is number {
  return typeof value === "number";
}

function buildMonthlyUptime(checks: Array<{ status: string; createdAt: Date }>) {
  const buckets = new Map<string, { total: number; up: number }>();

  for (const check of checks) {
    if (check.status === "pending") {
      continue;
    }

    const key = `${check.createdAt.getUTCFullYear()}-${String(check.createdAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key) ?? { total: 0, up: 0 };
    bucket.total += 1;
    if (check.status === "up") {
      bucket.up += 1;
    }
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .map(([label, bucket]) => ({
      label,
      uptimePct: bucket.total > 0 ? (bucket.up / bucket.total) * 100 : 100,
      checks: bucket.total,
    }))
    .slice(-6);
}

function resolveTagPatch(current: string[], incoming: string[], action: "add" | "remove" | "replace") {
  if (action === "replace") {
    return incoming;
  }

  if (action === "remove") {
    return current.filter((tag) => !incoming.includes(tag));
  }

  return Array.from(new Set([...current, ...incoming]));
}
