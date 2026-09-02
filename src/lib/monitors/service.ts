import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { getCompanyById } from "@/lib/companies/service";
import { db, type DatabaseExecutor } from "@/lib/db";
import {
  monitors,
} from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/errors";
import { recordAuditEventSafely } from "@/lib/audit/service";
import { MAX_MONITORS_PER_USER } from "@/lib/import-limits";
import { resolveOutage } from "@/lib/outages/service";
import { MIN_HEARTBEAT_TOKEN_LENGTH } from "@/lib/monitors/constants";
import type { MonitorInput } from "@/lib/monitors/schemas";
import {
  buildCanonicalMonitorTarget,
  buildHeartbeatMonitorTarget,
  buildMonitorIdentityKey,
  parseHeartbeatMonitorTarget,
  parsePingMonitorTarget,
  parsePortMonitorTarget,
  parsePostgresMonitorTarget,
} from "@/lib/monitors/targets";
import { intervalToMs } from "@/lib/monitors/utils";
import { getMonitorUptimeById, NO_MONITOR_UPTIME_DATA } from "@/lib/monitoring/uptime";
import {
  decryptValueOrLegacyPlaintext,
  encryptValue,
  hashSecretValue,
} from "@/lib/security/encryption";
import { canUserAccessPrivateTargets } from "@/lib/security/network-policy";
import { assertMonitorNetworkTarget } from "@/lib/security/public-network-target";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import { assertHeartbeatTokenAvailable } from "@/lib/monitors/heartbeat-secrets";
import type { ClaimedMonitor } from "@/lib/monitors/runtime-service";
import { requireWorkspaceIdForUser } from "@/lib/workspaces/ownership";
export {
  normalizeHeartbeatTokenInput,
  receiveHeartbeat,
} from "@/lib/monitors/heartbeat-service";
export {
  calculateMonitorLeaseMs,
  claimDueMonitors,
  countDueMonitors,
  isMonitorActive,
  recordMonitorResult,
  refreshMonitorUptime,
  releaseMonitorLease,
  renewMonitorLease,
} from "@/lib/monitors/runtime-service";
export type { ClaimedMonitor } from "@/lib/monitors/runtime-service";
export {
  appendMonitorCheck,
  appendMonitorDiagnostic,
  appendMonitorEvent,
  appendOutageEvent,
  countMonitorEvents,
  getRecentMonitorEventMessage,
  getWorkerState,
  hasRecentMonitorEvent,
  incrementWorkerCheckedCount,
  updateWorkerState,
} from "@/lib/monitors/runtime-store";
export {
  getCompanyMonthlyUptimeReport,
  getCompanySlaReport,
  listRecentMonitorChecks,
  listRecentMonitorDiagnostics,
  listRecentOutageEvents,
  summarizeCompanyRecentChecks,
} from "@/lib/monitors/insights";

const WORKER_CONTROL_ADVISORY_LOCK_KEY = 51_772_903;
const MONITOR_TARGET_LOCK_PREFIX = "sentrovia:monitor-targets:";
const MAX_COLD_START_SPREAD_MS = 5 * 60_000;
const MONITOR_PUBLIC_TARGET_ERROR = "Monitor target is not allowed by the current network safety policy.";
export const SOFT_DELETE_UNDO_MS = 60_000;

export type MonitorListQuery = {
  page: number;
  pageSize: number;
  search?: string;
  companyId?: string;
  status?: "up" | "down" | "pending";
  sort: "createdAt" | "name" | "status" | "lastCheckedAt" | "latencyMs";
  direction: "asc" | "desc";
};

export async function listMonitors(
  userId: string,
  database: DatabaseExecutor = db,
  workspaceId?: string
) {
  const monitorRows = await database
    .select()
    .from(monitors)
    .where(and(monitorOwnershipCondition(userId, workspaceId), isNull(monitors.deletedAt)))
    .orderBy(desc(monitors.createdAt));

  const uptimeByMonitorId = await getMonitorUptimeById(
    userId,
    monitorRows.map((monitor) => monitor.id),
    new Date(),
    database,
    workspaceId
  );

  return monitorRows.map((monitor) => ({
    ...monitor,
    uptime: uptimeByMonitorId.get(monitor.id) ?? NO_MONITOR_UPTIME_DATA,
  }));
}

export async function listMonitorsPage(
  userId: string,
  query: MonitorListQuery,
  database: DatabaseExecutor = db,
  workspaceId?: string
) {
  const search = query.search?.trim();
  const searchPattern = search ? `%${search}%` : null;
  const where = and(
    monitorOwnershipCondition(userId, workspaceId),
    isNull(monitors.deletedAt),
    query.companyId ? eq(monitors.companyId, query.companyId) : undefined,
    query.status ? eq(monitors.status, query.status) : undefined,
    searchPattern
      ? or(
          ilike(monitors.name, searchPattern),
          ilike(monitors.url, searchPattern),
          ilike(monitors.company, searchPattern),
          sql<boolean>`array_to_string(${monitors.tags}, ' ') ilike ${searchPattern}`
        )
      : undefined
  );
  const sortColumn = {
    createdAt: monitors.createdAt,
    name: monitors.name,
    status: monitors.status,
    lastCheckedAt: monitors.lastCheckedAt,
    latencyMs: monitors.latencyMs,
  }[query.sort];
  const order = query.direction === "asc" ? asc : desc;
  const [totalRows, monitorRows] = await Promise.all([
    database.select({ total: count() }).from(monitors).where(where),
    database
      .select()
      .from(monitors)
      .where(where)
      .orderBy(order(sortColumn), order(monitors.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
  ]);
  const totalItems = Number(totalRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalItems / query.pageSize));
  const uptimeByMonitorId = await getMonitorUptimeById(
    userId,
    monitorRows.map((monitor) => monitor.id),
    new Date(),
    database,
    workspaceId
  );

  return {
    monitors: monitorRows.map((monitor) => ({
      ...monitor,
      uptime: uptimeByMonitorId.get(monitor.id) ?? NO_MONITOR_UPTIME_DATA,
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    },
  };
}

export async function createMonitor(userId: string, input: MonitorInput, workspaceId?: string) {
  return db.transaction(async (tx) => {
    const resolvedWorkspaceId = workspaceId ?? await requireWorkspaceIdForUser(userId, tx);
    await lockMonitorTargets(tx, resolvedWorkspaceId);
    await assertMonitorQuota(userId, 1, tx, resolvedWorkspaceId);
    const allowPrivateTargets = await canUserAccessPrivateTargets(userId, tx);
    const values = await buildMonitorValues(userId, input, null, allowPrivateTargets, tx, resolvedWorkspaceId);
    await assertMonitorTargetAvailable(
      userId,
      values.monitorType,
      values.url,
      null,
      tx,
      resolvedWorkspaceId
    );
    const [monitor] = await tx
      .insert(monitors)
      .values(values)
      .returning();

    return monitor;
  });
}

export async function buildMonitorForTest(
  userId: string,
  input: MonitorInput,
  monitorId?: string | null,
  workspaceId?: string
): Promise<ClaimedMonitor> {
  const existingMonitor = monitorId ? await getMonitorById(userId, monitorId, db, workspaceId) : null;
  if (monitorId && !existingMonitor) {
    throw new AuthError("Monitor not found.", 404);
  }

  const allowPrivateTargets = await canUserAccessPrivateTargets(userId);
  const values = await buildMonitorValues(
    userId,
    input,
    existingMonitor,
    allowPrivateTargets,
    db,
    workspaceId
  );
  const now = new Date();

  return {
    ...(existingMonitor ?? {
      id: crypto.randomUUID(),
      status: "pending",
      statusCode: null,
      uptime: "--",
      deletedAt: null,
      deletedWasActive: null,
      lastCheckedAt: null,
      nextCheckAt: null,
      leaseToken: null,
      leaseExpiresAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      sslExpiresAt: null,
      lastErrorMessage: null,
      consecutiveFailures: 0,
      verificationMode: false,
      verificationFailureCount: 0,
      latencyMs: null,
      isFavorite: false,
      isCritical: false,
      createdAt: now,
      updatedAt: now,
    }),
    ...values,
    isFavorite: existingMonitor?.isFavorite ?? false,
    isCritical: existingMonitor?.isCritical ?? false,
    leaseToken: null,
    leaseExpiresAt: null,
    allowPrivateTargets,
    updatedAt: now,
  };
}

export async function updateMonitor(
  userId: string,
  monitorId: string,
  input: MonitorInput,
  workspaceId?: string
) {
  return db.transaction(async (tx) => {
    const resolvedWorkspaceId = workspaceId ?? await requireWorkspaceIdForUser(userId, tx);
    await lockMonitorTargets(tx, resolvedWorkspaceId);
    const existingMonitor = await getMonitorById(userId, monitorId, tx, resolvedWorkspaceId);
    if (!existingMonitor) {
      return null;
    }

    const allowPrivateTargets = await canUserAccessPrivateTargets(userId, tx);
    const values = await buildMonitorValues(
      userId,
      input,
      existingMonitor,
      allowPrivateTargets,
      tx,
      resolvedWorkspaceId
    );
    await assertMonitorTargetAvailable(
      userId,
      values.monitorType,
      values.url,
      monitorId,
      tx,
      resolvedWorkspaceId
    );
    const now = new Date();
    const targetChanged = hasMonitorTargetChanged(existingMonitor, values);
    const activeStateUpdate = buildActiveStateUpdate(existingMonitor.isActive, values.isActive, now);
    const scheduleUpdate = buildConfigurationScheduleUpdate(
      existingMonitor.isActive,
      values.isActive,
      now
    );
    const targetResetUpdate = targetChanged
      ? buildMonitorTargetResetState(values.isActive, now)
      : {};
    const [monitor] = await tx
      .update(monitors)
      .set({
        ...values,
        leaseToken: null,
        leaseExpiresAt: null,
        ...activeStateUpdate,
        ...scheduleUpdate,
        ...targetResetUpdate,
        userId,
        updatedAt: now,
      })
      .where(and(
        eq(monitors.id, monitorId),
        eq(monitors.workspaceId, resolvedWorkspaceId),
        isNull(monitors.deletedAt)
      ))
      .returning();

    if (!monitor) {
      return null;
    }

    await resolveOutageOnPause(existingMonitor, values.isActive, now, tx);
    if (targetChanged && existingMonitor.isActive && values.isActive) {
      await resolveOutage({
        monitorId: existingMonitor.id,
        userId: existingMonitor.userId,
        checkedAt: now,
        statusCode: existingMonitor.statusCode,
      }, tx);
    }
    return monitor;
  });
}

export async function withWorkerControlLock<T>(operation: () => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${WORKER_CONTROL_ADVISORY_LOCK_KEY})`);
    return operation();
  });
}

async function assertMonitorTargetAvailable(
  userId: string,
  monitorType: MonitorInput["monitorType"],
  url: string,
  excludedMonitorId: string | null,
  database: DatabaseExecutor = db,
  workspaceId?: string
) {
  const targetKey = buildMonitorIdentityKey({ monitorType, url });
  const existing = await listReservedMonitorTargets(userId, database, new Date(), workspaceId);

  const conflict = existing.some((monitor) => {
    if (monitor.id === excludedMonitorId) {
      return false;
    }

    return targetKey === buildMonitorIdentityKey({
      monitorType: normalizeMonitorType(monitor.monitorType),
      url: monitor.url,
    });
  });

  if (conflict) {
    throw new AuthError("A monitor with this target already exists.", 409);
  }
}

async function lockMonitorTargets(executor: Pick<typeof db, "execute">, ownershipId: string) {
  await executor.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`${MONITOR_TARGET_LOCK_PREFIX}${ownershipId}`}))`
  );
}

export async function updateMonitorActiveState(
  userId: string,
  monitorId: string,
  isActive: boolean,
  workspaceId?: string
) {
  return db.transaction(async (tx) => {
    const existingMonitor = await getMonitorById(userId, monitorId, tx, workspaceId);
    if (!existingMonitor) {
      return null;
    }

    const now = new Date();
    const [monitor] = await tx
      .update(monitors)
      .set({
        isActive,
        ...buildActiveStateUpdate(existingMonitor.isActive, isActive, now),
        updatedAt: now,
      })
      .where(and(
        eq(monitors.id, monitorId),
        monitorOwnershipCondition(userId, workspaceId),
        isNull(monitors.deletedAt)
      ))
      .returning();

    if (!monitor) {
      return null;
    }

    await resolveOutageOnPause(existingMonitor, isActive, now, tx);
    return monitor;
  });
}

export async function updateMonitorFlags(
  userId: string,
  monitorId: string,
  input: { isFavorite?: boolean; isCritical?: boolean },
  workspaceId?: string
) {
  if (input.isFavorite === undefined && input.isCritical === undefined) {
    throw new AuthError("At least one dashboard flag is required.", 400);
  }

  const [monitor] = await db
    .update(monitors)
    .set({
      ...(input.isFavorite === undefined ? {} : { isFavorite: input.isFavorite }),
      ...(input.isCritical === undefined ? {} : { isCritical: input.isCritical }),
      updatedAt: new Date(),
    })
    .where(and(
      eq(monitors.id, monitorId),
      monitorOwnershipCondition(userId, workspaceId),
      isNull(monitors.deletedAt)
    ))
    .returning();

  return monitor ?? null;
}

export async function bulkUpdateMonitors(
  userId: string,
  ids: string[],
  input: MonitorInput,
  workspaceId?: string
) {
  return db.transaction(async (tx) => {
    const resolvedWorkspaceId = workspaceId ?? await requireWorkspaceIdForUser(userId, tx);
    const allowPrivateTargets = await canUserAccessPrivateTargets(userId, tx);
    const existingMonitors = await tx
      .select()
      .from(monitors)
      .where(and(
        eq(monitors.workspaceId, resolvedWorkspaceId),
        inArray(monitors.id, ids),
        isNull(monitors.deletedAt)
      ));
    const updated: Array<typeof monitors.$inferSelect> = [];
    const pausedOutages: Array<Parameters<typeof resolveOutage>[0]> = [];

    for (const existingMonitor of existingMonitors) {
      const mergedInput = buildBulkUpdatePayload(existingMonitor, input);
      const values = await buildMonitorValues(
        userId,
        mergedInput,
        existingMonitor,
        allowPrivateTargets,
        tx,
        resolvedWorkspaceId
      );
      const now = new Date();
      const scheduleUpdate = buildConfigurationScheduleUpdate(
        existingMonitor.isActive,
        values.isActive,
        now
      );
      const [monitor] = await tx
        .update(monitors)
        .set({
          ...values,
          leaseToken: null,
          leaseExpiresAt: null,
          ...buildActiveStateUpdate(existingMonitor.isActive, values.isActive, now),
          ...scheduleUpdate,
          userId,
          updatedAt: now,
        })
        .where(and(
          eq(monitors.id, existingMonitor.id),
          eq(monitors.workspaceId, resolvedWorkspaceId),
          isNull(monitors.deletedAt)
        ))
        .returning();

      if (monitor) {
        updated.push(monitor);
      }

      if (existingMonitor.isActive && !values.isActive) {
        pausedOutages.push({
          monitorId: existingMonitor.id,
          userId: existingMonitor.userId,
          checkedAt: now,
          statusCode: existingMonitor.statusCode,
        });
      }
    }

    for (const outage of pausedOutages) {
      await resolveOutage(outage, tx);
    }

    return updated;
  });
}

export async function updateMonitorTags(
  userId: string,
  ids: string[],
  action: "add" | "remove" | "replace",
  tags: string[],
  workspaceId?: string
) {
  const normalizedTags = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
  return db.transaction(async (tx) => {
    const current = await tx
      .select()
      .from(monitors)
      .where(and(
        monitorOwnershipCondition(userId, workspaceId),
        inArray(monitors.id, ids),
        isNull(monitors.deletedAt)
      ));
    const updated: Array<typeof monitors.$inferSelect> = [];

    for (const monitor of current) {
      const nextTags = resolveTagPatch(monitor.tags, normalizedTags, action);
      const [item] = await tx
        .update(monitors)
        .set({
          tags: nextTags,
          updatedAt: new Date(),
        })
        .where(and(
          eq(monitors.id, monitor.id),
          monitorOwnershipCondition(userId, workspaceId),
          isNull(monitors.deletedAt)
        ))
        .returning();

      if (item) {
        updated.push(item);
      }
    }

    return updated;
  });
}

export async function deleteMonitors(userId: string, ids: string[], workspaceId?: string) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: monitors.id, status: monitors.status, statusCode: monitors.statusCode })
      .from(monitors)
      .where(and(
        monitorOwnershipCondition(userId, workspaceId),
        inArray(monitors.id, ids),
        isNull(monitors.deletedAt)
      ));
    const deleted = await tx
      .update(monitors)
      .set({
        deletedAt: now,
        deletedWasActive: sql`${monitors.isActive}`,
        isActive: false,
        nextCheckAt: null,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(and(
        monitorOwnershipCondition(userId, workspaceId),
        inArray(monitors.id, ids),
        isNull(monitors.deletedAt)
      ))
      .returning({ id: monitors.id, deletedAt: monitors.deletedAt });

    const deletedIds = new Set(deleted.map((monitor) => monitor.id));
    const outages = existing.filter((monitor) => deletedIds.has(monitor.id) && monitor.status === "down");
    for (const monitor of outages) {
      await resolveOutage({
        monitorId: monitor.id,
        userId,
        checkedAt: now,
        statusCode: monitor.statusCode,
      }, tx);
    }

    return deleted;
  });
}

export async function restoreMonitors(
  userId: string,
  ids: string[],
  now = new Date(),
  workspaceId?: string
) {
  return db.transaction(async (tx) => {
    const resolvedWorkspaceId = workspaceId ?? await requireWorkspaceIdForUser(userId, tx);
    await lockMonitorTargets(tx, resolvedWorkspaceId);
    const undoCutoff = new Date(now.getTime() - SOFT_DELETE_UNDO_MS);
    const nextCheckTimestamp = now.toISOString();
    const [restorable] = await tx
      .select({ total: count() })
      .from(monitors)
      .where(and(
        eq(monitors.workspaceId, resolvedWorkspaceId),
        inArray(monitors.id, ids),
        isNotNull(monitors.deletedAt),
        gte(monitors.deletedAt, undoCutoff)
      ));
    await assertMonitorQuota(userId, Number(restorable?.total ?? 0), tx, resolvedWorkspaceId);

    return tx
      .update(monitors)
      .set({
        ...buildRestoredMonitorState(),
        deletedAt: null,
        isActive: sql`coalesce(${monitors.deletedWasActive}, false)`,
        deletedWasActive: null,
        nextCheckAt: sql`case when coalesce(${monitors.deletedWasActive}, false) then (${nextCheckTimestamp})::timestamptz else null end`,
        updatedAt: now,
      })
      .where(and(
        eq(monitors.workspaceId, resolvedWorkspaceId),
        inArray(monitors.id, ids),
        isNotNull(monitors.deletedAt),
        gte(monitors.deletedAt, undoCutoff)
      ))
      .returning();
  });
}

export function buildRestoredMonitorState() {
  return {
    status: "pending",
    statusCode: null,
    uptime: "--",
    lastCheckedAt: null,
    lastFailureAt: null,
    sslExpiresAt: null,
    lastErrorMessage: null,
    consecutiveFailures: 0,
    verificationMode: false,
    verificationFailureCount: 0,
    latencyMs: null,
    leaseToken: null,
    leaseExpiresAt: null,
  };
}

export function hasMonitorTargetChanged(
  existingMonitor: { monitorType: string; url: string },
  nextMonitor: { monitorType: string; url: string }
) {
  return normalizeMonitorType(existingMonitor.monitorType) !== normalizeMonitorType(nextMonitor.monitorType)
    || existingMonitor.url !== nextMonitor.url;
}

export function buildMonitorTargetResetState(isActive: boolean, now: Date) {
  return {
    ...buildRestoredMonitorState(),
    lastSuccessAt: null,
    nextCheckAt: isActive ? now : null,
  };
}

export async function createManyMonitors(
  userId: string,
  inputs: MonitorInput[],
  database?: DatabaseExecutor,
  workspaceId?: string
) {
  if (database) {
    const resolvedWorkspaceId = workspaceId ?? await requireWorkspaceIdForUser(userId, database);
    await lockMonitorTargets(database, resolvedWorkspaceId);
    return persistManyMonitors(userId, inputs, database, resolvedWorkspaceId);
  }

  return db.transaction(async (tx) => {
    const resolvedWorkspaceId = workspaceId ?? await requireWorkspaceIdForUser(userId, tx);
    await lockMonitorTargets(tx, resolvedWorkspaceId);
    return persistManyMonitors(userId, inputs, tx, resolvedWorkspaceId);
  });
}

async function persistManyMonitors(
  userId: string,
  inputs: MonitorInput[],
  database: DatabaseExecutor,
  workspaceId: string
) {
  const existing = await listReservedMonitorTargets(userId, database, new Date(), workspaceId);
  const allowPrivateTargets = await canUserAccessPrivateTargets(userId, database);

  const existingTargets = new Set(
    existing.map((item) =>
      buildMonitorIdentityKey({
        monitorType: normalizeMonitorType(item.monitorType),
        url: item.url,
      })
    )
  );
  const filtered = filterDuplicateMonitorInputs(inputs, existingTargets);
  await assertMonitorQuota(userId, filtered.length, database, workspaceId);
  const values = await Promise.all(filtered.map((input) =>
    buildMonitorValues(userId, input, null, allowPrivateTargets, database, workspaceId)
  ));
  const valuesWithInitialSchedule = spreadInitialMonitorChecks(values, new Date());

  if (valuesWithInitialSchedule.length === 0) {
    return [];
  }

  return database.insert(monitors).values(valuesWithInitialSchedule).returning();
}

async function assertMonitorQuota(
  userId: string,
  requested: number,
  database: DatabaseExecutor = db,
  workspaceId?: string
) {
  if (requested <= 0) {
    return;
  }

  const [row] = await database
    .select({ total: count() })
    .from(monitors)
    .where(and(monitorOwnershipCondition(userId, workspaceId), isNull(monitors.deletedAt)));
  const current = Number(row?.total ?? 0);

  if (current + requested > MAX_MONITORS_PER_USER) {
    throw new AuthError(
      `A workspace can contain at most ${MAX_MONITORS_PER_USER.toLocaleString("en-US")} monitors.`,
      409
    );
  }
}

export async function listReservedMonitorTargets(
  userId: string,
  database: DatabaseExecutor = db,
  now = new Date(),
  workspaceId?: string
) {
  const undoCutoff = new Date(now.getTime() - SOFT_DELETE_UNDO_MS);
  return database
    .select({ id: monitors.id, monitorType: monitors.monitorType, url: monitors.url })
    .from(monitors)
    .where(
      and(
        monitorOwnershipCondition(userId, workspaceId),
        or(isNull(monitors.deletedAt), gte(monitors.deletedAt, undoCutoff))
      )
    );
}

export function filterDuplicateMonitorInputs(inputs: MonitorInput[], existingTargets: Set<string>) {
  const seenTargets = new Set(existingTargets);

  return inputs.filter((input) => {
    const key = getMonitorImportIdentityKey(input);
    if (!key) {
      return true;
    }

    if (seenTargets.has(key)) {
      return false;
    }

    seenTargets.add(key);
    return true;
  });
}

export function getMonitorImportIdentityKey(input: MonitorInput) {
  if (input.monitorType === "heartbeat" && input.heartbeatToken.trim().length === 0) {
    return null;
  }

  return buildMonitorIdentityKey({
    monitorType: input.monitorType,
    url: buildCanonicalMonitorTarget(input),
  });
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

function buildActiveStateUpdate(wasActive: boolean, isActive: boolean, now: Date) {
  if (wasActive && isActive) {
    return {};
  }

  return {
    status: "pending",
    statusCode: null,
    uptime: "--",
    nextCheckAt: isActive ? now : null,
    leaseToken: null,
    leaseExpiresAt: null,
    lastFailureAt: null,
    lastErrorMessage: null,
    consecutiveFailures: 0,
    verificationMode: false,
    verificationFailureCount: 0,
    latencyMs: null,
  };
}

export function buildConfigurationScheduleUpdate(
  wasActive: boolean,
  isActive: boolean,
  now: Date
) {
  return wasActive && isActive ? { nextCheckAt: now } : {};
}

async function resolveOutageOnPause(
  monitor: typeof monitors.$inferSelect,
  nextActiveState: boolean,
  resolvedAt: Date,
  database: DatabaseExecutor = db
) {
  if (!monitor.isActive || nextActiveState) {
    return;
  }

  await resolveOutage({
    monitorId: monitor.id,
    userId: monitor.userId,
    checkedAt: resolvedAt,
    statusCode: monitor.statusCode,
  }, database);
}



async function buildMonitorValues(
  userId: string,
  input: MonitorInput,
  existingMonitor: typeof monitors.$inferSelect | null,
  allowPrivateTargets: boolean,
  database: DatabaseExecutor = db,
  workspaceId?: string
) {
  const resolvedWorkspaceId = existingMonitor?.workspaceId
    ?? workspaceId
    ?? await requireWorkspaceIdForUser(userId, database);
  const identity = await resolveMonitorIdentity(
    userId,
    input,
    existingMonitor,
    database,
    resolvedWorkspaceId
  );
  try {
    await assertMonitorNetworkTargetAllowed(identity.monitorType, identity.url, allowPrivateTargets);
  } catch (error) {
    await recordBlockedMonitorTarget(userId, input.name, identity.monitorType);
    throw error;
  }
  const databasePasswordEncrypted =
    identity.monitorType === "postgres"
      ? resolveDatabasePassword(input, existingMonitor)
      : null;

  return {
    ...buildCommonMonitorValues(resolvedWorkspaceId, userId, input, identity),
    ...buildTypeSpecificMonitorValues(input, existingMonitor, identity, databasePasswordEncrypted),
  };
}

async function resolveMonitorIdentity(
  userId: string,
  input: MonitorInput,
  existingMonitor: typeof monitors.$inferSelect | null,
  database: DatabaseExecutor,
  workspaceId: string
) {
  const companyRecord = input.companyId
    ? await getCompanyById({ userId, workspaceId }, input.companyId, database)
    : null;
  const monitorType = normalizeMonitorType(input.monitorType);
  const heartbeatToken = monitorType === "heartbeat" ? resolveHeartbeatToken(input, existingMonitor) : null;
  const heartbeatTokenHash = heartbeatToken ? hashSecretValue("heartbeat-token", heartbeatToken) : null;
  if (monitorType === "heartbeat" && heartbeatToken && heartbeatTokenHash) {
    await assertHeartbeatTokenAvailable(heartbeatToken, heartbeatTokenHash, existingMonitor?.id ?? null, database);
  }
  const url = monitorType === "heartbeat"
    ? buildHeartbeatMonitorTarget(heartbeatTokenHash ?? "")
    : buildCanonicalMonitorTarget({ ...input, heartbeatToken: heartbeatToken ?? input.heartbeatToken });
  return { companyRecord, heartbeatToken, heartbeatTokenHash, monitorType, url };
}

type MonitorIdentity = Awaited<ReturnType<typeof resolveMonitorIdentity>>;

function buildCommonMonitorValues(
  workspaceId: string,
  userId: string,
  input: MonitorInput,
  identity: MonitorIdentity
) {
  return {
    workspaceId,
    userId,
    name: input.name,
    monitorType: identity.monitorType,
    url: identity.url,
    companyId: identity.companyRecord?.id ?? null,
    company: identity.companyRecord?.name ?? input.company,
    notificationPref: input.notificationPref,
    notificationLanguage: input.notificationLanguage,
    notifEmail: input.notifEmail,
    telegramBotToken: input.telegramBotToken ? encryptValue(input.telegramBotToken) : null,
    telegramChatId: input.telegramChatId,
    intervalValue: input.intervalValue,
    intervalUnit: input.intervalUnit,
    timeout: input.timeout,
    retries: input.retries,
    tags: input.tags,
    renotifyCount: input.renotifyCount,
    telegramTemplate: input.telegramTemplate,
    emailSubject: input.emailSubject,
    emailBody: input.emailBody,
    slowResponseEmailSubject: input.slowResponseEmailSubject,
    slowResponseEmailBody: input.slowResponseEmailBody,
    slowResponseTelegramTemplate: input.slowResponseTelegramTemplate,
    sendOutageScreenshot: shouldPersistOutageScreenshot(
      identity.monitorType,
      input.notificationPref,
      input.sendOutageScreenshot
    ),
    isActive: input.isActive,
    publishOnStatusPage: input.publishOnStatusPage,
  };
}

function buildTypeSpecificMonitorValues(
  input: MonitorInput,
  existingMonitor: typeof monitors.$inferSelect | null,
  identity: MonitorIdentity,
  databasePasswordEncrypted: string | null
) {
  const { heartbeatToken, heartbeatTokenHash, monitorType } = identity;
  const supportsHttpOptions = monitorType === "http" || monitorType === "keyword" || monitorType === "json";
  const usesSyntheticGet = monitorType === "port" || monitorType === "postgres" || monitorType === "ping" || monitorType === "heartbeat";
  return {
    heartbeatToken: heartbeatToken ? encryptValue(heartbeatToken) : null,
    heartbeatTokenHash,
    heartbeatLastReceivedAt: monitorType === "heartbeat" ? existingMonitor?.heartbeatLastReceivedAt ?? null : null,
    slowResponseThresholdMs: shouldPersistSlowResponseThreshold(monitorType, input.slowResponseThresholdMs),
    slowResponseAlertsEnabled: shouldPersistSlowResponseAlerts(monitorType, input.slowResponseAlertsEnabled),
    expectedStatusCodes: shouldPersistExpectedStatusCodes(monitorType, input.expectedStatusCodes),
    method: usesSyntheticGet ? "GET" : input.method,
    databaseSsl: monitorType === "postgres" ? input.databaseSsl : true,
    databaseTlsVerify: monitorType === "postgres" ? input.databaseTlsVerify : true,
    databasePasswordEncrypted,
    keywordQuery: monitorType === "keyword" ? input.keywordQuery.trim() : null,
    keywordInvert: monitorType === "keyword" ? input.keywordInvert : false,
    jsonPath: monitorType === "json" ? input.jsonPath.trim() : null,
    jsonExpectedValue: monitorType === "json" ? input.jsonExpectedValue.trim() : null,
    jsonMatchMode: monitorType === "json" ? input.jsonMatchMode : "equals",
    maxRedirects: usesSyntheticGet ? 0 : input.maxRedirects,
    ipFamily: monitorType === "postgres" || monitorType === "heartbeat" ? "auto" : input.ipFamily,
    checkSslExpiry: supportsHttpOptions ? input.checkSslExpiry : false,
    ignoreSslErrors: supportsHttpOptions ? input.ignoreSslErrors : false,
    cacheBuster: supportsHttpOptions ? input.cacheBuster : false,
    saveErrorPages: supportsHttpOptions ? input.saveErrorPages : false,
    saveSuccessPages: supportsHttpOptions ? input.saveSuccessPages : false,
    responseMaxLength: usesSyntheticGet ? 0 : input.responseMaxLength,
  };
}

async function recordBlockedMonitorTarget(
  userId: string,
  monitorName: string,
  monitorType: MonitorInput["monitorType"]
) {
  await recordAuditEventSafely({
    userId,
    actorUserId: userId,
    actorLabel: userId,
    entityType: "monitor",
    entityLabel: monitorName,
    action: "monitor.target.blocked",
    summary: `${monitorType} monitor target was rejected by the network safety policy.`,
  });
}


async function getMonitorById(
  userId: string,
  monitorId: string,
  database: DatabaseExecutor = db,
  workspaceId?: string
) {
  const [monitor] = await database
    .select()
    .from(monitors)
    .where(and(
      eq(monitors.id, monitorId),
      monitorOwnershipCondition(userId, workspaceId),
      isNull(monitors.deletedAt)
    ));

  return monitor ?? null;
}

function monitorOwnershipCondition(userId: string, workspaceId?: string) {
  return workspaceId
    ? eq(monitors.workspaceId, workspaceId)
    : eq(monitors.userId, userId);
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
    isActive: existingMonitor.isActive,
    publishOnStatusPage: existingMonitor.publishOnStatusPage,
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
    payload.databaseTlsVerify = existingMonitor.databaseTlsVerify;
  }

  return payload;
}

function normalizeMonitorType(value: string | null | undefined): MonitorInput["monitorType"] {
  if (value === "port" || value === "postgres" || value === "keyword" || value === "json" || value === "ping" || value === "heartbeat") {
    return value;
  }

  return "http";
}

function shouldPersistOutageScreenshot(
  monitorType: MonitorInput["monitorType"],
  notificationPref: MonitorInput["notificationPref"],
  requested: boolean
) {
  const supportsScreenshot = monitorType === "http" || monitorType === "keyword" || monitorType === "json";
  const sendsScreenshotCapableAlert =
    notificationPref === "email" || notificationPref === "telegram" || notificationPref === "both";

  return requested && supportsScreenshot && sendsScreenshotCapableAlert;
}

function shouldPersistSlowResponseAlerts(
  monitorType: MonitorInput["monitorType"],
  requested: boolean
) {
  const supportsSlowResponseThreshold =
    monitorType === "http" || monitorType === "keyword" || monitorType === "json";

  return requested && supportsSlowResponseThreshold;
}

function shouldPersistSlowResponseThreshold(
  monitorType: MonitorInput["monitorType"],
  thresholdMs: number | null
) {
  if (monitorType !== "http" && monitorType !== "keyword" && monitorType !== "json") {
    return null;
  }

  return thresholdMs;
}

function shouldPersistExpectedStatusCodes(
  monitorType: MonitorInput["monitorType"],
  expectedStatusCodes: string
) {
  if (monitorType !== "http" && monitorType !== "keyword" && monitorType !== "json") {
    return null;
  }

  return expectedStatusCodes || null;
}

export async function assertMonitorNetworkTargetAllowed(
  monitorType: MonitorInput["monitorType"],
  url: string,
  allowPrivateTargets = false
) {
  if (monitorType === "heartbeat") {
    return;
  }

  await assertMonitorNetworkTarget(resolveMonitorTargetHostname(monitorType, url), {
    allowPrivateTargets,
    allowUnresolved: true,
    message: MONITOR_PUBLIC_TARGET_ERROR,
  });
}


function resolveMonitorTargetHostname(monitorType: MonitorInput["monitorType"], url: string) {
  if (monitorType === "port") {
    return parsePortMonitorTarget(url).host;
  }

  if (monitorType === "ping") {
    return parsePingMonitorTarget(url).host;
  }

  if (monitorType === "postgres") {
    return parsePostgresMonitorTarget(url).host;
  }

  return new URL(url.split("#")[0]).hostname;
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
    return decryptValueOrLegacyPlaintext(existingMonitor.heartbeatToken) ?? "";
  }

  if (input.heartbeatToken.trim().length >= MIN_HEARTBEAT_TOKEN_LENGTH) {
    return input.heartbeatToken.trim();
  }

  return crypto.randomUUID();
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
