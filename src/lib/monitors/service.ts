import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { getCompanyById } from "@/lib/companies/service";
import { db, type DatabaseExecutor } from "@/lib/db";
import {
  outageEvents,
  monitorChecks,
  monitorDiagnostics,
  monitorEvents,
  monitors,
  userSettings,
  users,
  workerState,
  type Monitor,
} from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/errors";
import { recordAuditEventSafely } from "@/lib/audit/service";
import type { MonitorDiagnosticResult } from "@/lib/diagnostics/types";
import { env } from "@/lib/env";
import { MAX_MONITORS_PER_USER } from "@/lib/import-limits";
import { resolveOutage } from "@/lib/outages/service";
import { MAX_HEARTBEAT_TOKEN_LENGTH, MIN_HEARTBEAT_TOKEN_LENGTH } from "@/lib/monitors/constants";
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
import { calculateVerificationLeaseBudgetMs } from "@/lib/monitors/verification";
import {
  decryptValueOrLegacyPlaintext,
  encryptValue,
  hashSecretValue,
  isEncryptedValue,
} from "@/lib/security/encryption";
import { canUserAccessPrivateTargets } from "@/lib/security/network-policy";
import { assertMonitorNetworkTarget } from "@/lib/security/public-network-target";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import { getMonitorSlaPeriods } from "@/lib/monitoring/sla-service";

const WORKER_STATE_ID = "primary";
const WORKER_CONTROL_ADVISORY_LOCK_KEY = 51_772_903;
const MONITOR_TARGET_LOCK_PREFIX = "sentrovia:monitor-targets:";
const MONITOR_LEASE_MS = Math.max(env.workerPollIntervalMs * 6, 180_000);
const MONITOR_LEASE_SAFETY_MS = 120_000;
const MAX_COLD_START_SPREAD_MS = 5 * 60_000;
const MAX_DUE_USERS_PER_CYCLE = 100;
const DUE_USER_QUERY_CONCURRENCY = 10;
const MONITOR_PUBLIC_TARGET_ERROR = "Monitor target is not allowed by the current network safety policy.";
export const SOFT_DELETE_UNDO_MS = 60_000;
export type ClaimedMonitor = Monitor & { allowPrivateTargets: boolean };

export async function listMonitors(userId: string, database: DatabaseExecutor = db) {
  return database
    .select()
    .from(monitors)
    .where(and(eq(monitors.userId, userId), isNull(monitors.deletedAt)))
    .orderBy(desc(monitors.createdAt));
}

export async function createMonitor(userId: string, input: MonitorInput) {
  return db.transaction(async (tx) => {
    await lockMonitorTargets(tx, userId);
    await assertMonitorQuota(userId, 1, tx);
    const allowPrivateTargets = await canUserAccessPrivateTargets(userId, tx);
    const values = await buildMonitorValues(userId, input, null, allowPrivateTargets, tx);
    await assertMonitorTargetAvailable(userId, values.monitorType, values.url, null, tx);
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
  monitorId?: string | null
): Promise<ClaimedMonitor> {
  const existingMonitor = monitorId ? await getMonitorById(userId, monitorId) : null;
  if (monitorId && !existingMonitor) {
    throw new AuthError("Monitor not found.", 404);
  }

  const allowPrivateTargets = await canUserAccessPrivateTargets(userId);
  const values = await buildMonitorValues(userId, input, existingMonitor, allowPrivateTargets);
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

export async function updateMonitor(userId: string, monitorId: string, input: MonitorInput) {
  return db.transaction(async (tx) => {
    await lockMonitorTargets(tx, userId);
    const existingMonitor = await getMonitorById(userId, monitorId, tx);
    if (!existingMonitor) {
      return null;
    }

    const allowPrivateTargets = await canUserAccessPrivateTargets(userId, tx);
    const values = await buildMonitorValues(userId, input, existingMonitor, allowPrivateTargets, tx);
    await assertMonitorTargetAvailable(userId, values.monitorType, values.url, monitorId, tx);
    const now = new Date();
    const activeStateUpdate = buildActiveStateUpdate(existingMonitor.isActive, values.isActive, now);
    const [monitor] = await tx
      .update(monitors)
      .set({
        ...values,
        leaseToken: null,
        leaseExpiresAt: null,
        ...activeStateUpdate,
        userId,
        updatedAt: now,
      })
      .where(and(eq(monitors.id, monitorId), eq(monitors.userId, userId), isNull(monitors.deletedAt)))
      .returning();

    if (!monitor) {
      return null;
    }

    await resolveOutageOnPause(existingMonitor, values.isActive, now, tx);
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
  database: DatabaseExecutor = db
) {
  const targetKey = buildMonitorIdentityKey({ monitorType, url });
  const existing = await listReservedMonitorTargets(userId, database);

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

async function lockMonitorTargets(executor: Pick<typeof db, "execute">, userId: string) {
  await executor.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`${MONITOR_TARGET_LOCK_PREFIX}${userId}`}))`
  );
}

export async function updateMonitorActiveState(userId: string, monitorId: string, isActive: boolean) {
  return db.transaction(async (tx) => {
    const existingMonitor = await getMonitorById(userId, monitorId, tx);
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
      .where(and(eq(monitors.id, monitorId), eq(monitors.userId, userId), isNull(monitors.deletedAt)))
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
  input: { isFavorite?: boolean; isCritical?: boolean }
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
    .where(and(eq(monitors.id, monitorId), eq(monitors.userId, userId), isNull(monitors.deletedAt)))
    .returning();

  return monitor ?? null;
}

export async function bulkUpdateMonitors(userId: string, ids: string[], input: MonitorInput) {
  return db.transaction(async (tx) => {
    const allowPrivateTargets = await canUserAccessPrivateTargets(userId, tx);
    const existingMonitors = await tx
      .select()
      .from(monitors)
      .where(and(eq(monitors.userId, userId), inArray(monitors.id, ids), isNull(monitors.deletedAt)));
    const updated: Array<typeof monitors.$inferSelect> = [];
    const pausedOutages: Array<Parameters<typeof resolveOutage>[0]> = [];

    for (const existingMonitor of existingMonitors) {
      const mergedInput = buildBulkUpdatePayload(existingMonitor, input);
      const values = await buildMonitorValues(
        userId,
        mergedInput,
        existingMonitor,
        allowPrivateTargets,
        tx
      );
      const now = new Date();
      const [monitor] = await tx
        .update(monitors)
        .set({
          ...values,
          leaseToken: null,
          leaseExpiresAt: null,
          ...buildActiveStateUpdate(existingMonitor.isActive, values.isActive, now),
          userId,
          updatedAt: now,
        })
        .where(and(
          eq(monitors.id, existingMonitor.id),
          eq(monitors.userId, userId),
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
  tags: string[]
) {
  const normalizedTags = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
  return db.transaction(async (tx) => {
    const current = await tx
      .select()
      .from(monitors)
      .where(and(eq(monitors.userId, userId), inArray(monitors.id, ids), isNull(monitors.deletedAt)));
    const updated: Array<typeof monitors.$inferSelect> = [];

    for (const monitor of current) {
      const nextTags = resolveTagPatch(monitor.tags, normalizedTags, action);
      const [item] = await tx
        .update(monitors)
        .set({
          tags: nextTags,
          updatedAt: new Date(),
        })
        .where(and(eq(monitors.id, monitor.id), eq(monitors.userId, userId), isNull(monitors.deletedAt)))
        .returning();

      if (item) {
        updated.push(item);
      }
    }

    return updated;
  });
}

export async function deleteMonitors(userId: string, ids: string[]) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: monitors.id, status: monitors.status, statusCode: monitors.statusCode })
      .from(monitors)
      .where(and(eq(monitors.userId, userId), inArray(monitors.id, ids), isNull(monitors.deletedAt)));
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
      .where(and(eq(monitors.userId, userId), inArray(monitors.id, ids), isNull(monitors.deletedAt)))
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

export async function restoreMonitors(userId: string, ids: string[], now = new Date()) {
  return db.transaction(async (tx) => {
    await lockMonitorTargets(tx, userId);
    const undoCutoff = new Date(now.getTime() - SOFT_DELETE_UNDO_MS);
    const nextCheckTimestamp = now.toISOString();
    const [restorable] = await tx
      .select({ total: count() })
      .from(monitors)
      .where(and(
        eq(monitors.userId, userId),
        inArray(monitors.id, ids),
        isNotNull(monitors.deletedAt),
        gte(monitors.deletedAt, undoCutoff)
      ));
    await assertMonitorQuota(userId, Number(restorable?.total ?? 0), tx);

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
        eq(monitors.userId, userId),
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

export async function createManyMonitors(userId: string, inputs: MonitorInput[], database?: DatabaseExecutor) {
  if (database) {
    await lockMonitorTargets(database, userId);
    return persistManyMonitors(userId, inputs, database);
  }

  return db.transaction(async (tx) => {
    await lockMonitorTargets(tx, userId);
    return persistManyMonitors(userId, inputs, tx);
  });
}

async function persistManyMonitors(userId: string, inputs: MonitorInput[], database: DatabaseExecutor) {
  const existing = await listReservedMonitorTargets(userId, database);
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
  await assertMonitorQuota(userId, filtered.length, database);
  const values = await Promise.all(filtered.map((input) =>
    buildMonitorValues(userId, input, null, allowPrivateTargets, database)
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
  database: DatabaseExecutor = db
) {
  if (requested <= 0) {
    return;
  }

  const [row] = await database
    .select({ total: count() })
    .from(monitors)
    .where(and(eq(monitors.userId, userId), isNull(monitors.deletedAt)));
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
  now = new Date()
) {
  const undoCutoff = new Date(now.getTime() - SOFT_DELETE_UNDO_MS);
  return database
    .select({ id: monitors.id, monitorType: monitors.monitorType, url: monitors.url })
    .from(monitors)
    .where(
      and(
        eq(monitors.userId, userId),
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

export async function claimDueMonitors(now: Date): Promise<ClaimedMonitor[]> {
  const dueUsers = await db
    .select({ userId: monitors.userId })
    .from(monitors)
    .where(buildDueMonitorPredicate(now))
    .groupBy(monitors.userId)
    .orderBy(asc(sql`min(coalesce(${monitors.nextCheckAt}, ${monitors.createdAt}))`))
    .limit(MAX_DUE_USERS_PER_CYCLE);

  if (dueUsers.length === 0) {
    return [];
  }

  const userIds = dueUsers.map((row) => row.userId);
  const settingsRows = await db
    .select({ userId: userSettings.userId, batchSize: userSettings.monitoringBatchSize })
    .from(userSettings)
    .where(inArray(userSettings.userId, userIds));

  const batchSizeMap = new Map(
    settingsRows.map((item) => [item.userId, item.batchSize ?? DEFAULT_SETTINGS.monitoring.batchSize])
  );
  const selectedRows = (await mapWithConcurrency(
    userIds,
    DUE_USER_QUERY_CONCURRENCY,
    (userId) => db
      .select()
      .from(monitors)
      .where(and(eq(monitors.userId, userId), buildDueMonitorPredicate(now)))
      .orderBy(desc(monitors.verificationMode), asc(monitors.nextCheckAt), asc(monitors.createdAt))
      .limit(batchSizeMap.get(userId) ?? DEFAULT_SETTINGS.monitoring.batchSize)
  )).flat();

  if (selectedRows.length === 0) {
    return [];
  }

  const leaseToken = crypto.randomUUID();
  const leaseDurationMs = calculateMonitorLeaseMs(selectedRows);
  const claimed = await db
    .update(monitors)
    .set({
      leaseToken,
      leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(
          monitors.id,
          selectedRows.map((monitor) => monitor.id)
        ),
        eq(monitors.isActive, true),
        isNull(monitors.deletedAt),
        or(lte(monitors.nextCheckAt, now), isNull(monitors.nextCheckAt)),
        or(lte(monitors.leaseExpiresAt, now), isNull(monitors.leaseExpiresAt))
      )
    )
    .returning();

  const claimedUserIds = Array.from(new Set(claimed.map((monitor) => monitor.userId)));
  const roleRows = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(inArray(users.id, claimedUserIds));
  const privateTargetUsers = new Set(
    roleRows.filter((user) => user.role === "admin").map((user) => user.id)
  );

  await encryptLegacyClaimedSecrets(claimed);

  return claimed.map((monitor): ClaimedMonitor => ({
    ...monitor,
    heartbeatToken: decryptValueOrLegacyPlaintext(monitor.heartbeatToken),
    telegramBotToken: decryptValueOrLegacyPlaintext(monitor.telegramBotToken),
    allowPrivateTargets: env.monitorAllowPrivateTargets && privateTargetUsers.has(monitor.userId),
  }));
}

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<TResult>
) {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]);
    }
  }));

  return results;
}

export async function countDueMonitors(now: Date) {
  const [row] = await db
    .select({ total: count() })
    .from(monitors)
    .where(buildDueMonitorPredicate(now));

  return Number(row?.total ?? 0);
}

function buildDueMonitorPredicate(now: Date) {
  return and(
    eq(monitors.isActive, true),
    isNull(monitors.deletedAt),
    or(lte(monitors.nextCheckAt, now), isNull(monitors.nextCheckAt)),
    or(lte(monitors.leaseExpiresAt, now), isNull(monitors.leaseExpiresAt))
  );
}

export function calculateMonitorLeaseMs(
  rows: Array<{ timeout: number; verificationMode?: boolean }>,
  concurrencyLimit = env.workerConcurrency
) {
  const concurrency = Math.max(1, concurrencyLimit);
  const maximumCheckBudgetMs = rows.reduce(
    (maximum, row) => {
      const timeoutMs = Math.max(0, row.timeout);
      const checkBudgetMs = row.verificationMode
        ? calculateVerificationLeaseBudgetMs(timeoutMs)
        : timeoutMs;
      return Math.max(maximum, checkBudgetMs);
    },
    0
  );
  const processingWaves = Math.max(1, Math.ceil(rows.length / concurrency));
  const batchProcessingBudgetMs = maximumCheckBudgetMs * processingWaves;

  return Math.max(MONITOR_LEASE_MS, batchProcessingBudgetMs + MONITOR_LEASE_SAFETY_MS);
}

export async function isMonitorActive(monitorId: string) {
  const [monitor] = await db
    .select({ isActive: monitors.isActive })
    .from(monitors)
    .where(and(eq(monitors.id, monitorId), isNull(monitors.deletedAt)))
    .limit(1);

  return monitor?.isActive === true;
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
  },
  expectedLeaseToken?: string | null
) {
  const extendedLeaseTimestamp = new Date(Date.now() + MONITOR_LEASE_MS).toISOString();
  const [monitor] = await db
    .update(monitors)
    .set({
      ...update,
      ...(expectedLeaseToken
        ? {
            leaseExpiresAt: sql`greatest(
              coalesce(${monitors.leaseExpiresAt}, now()),
              (${extendedLeaseTimestamp})::timestamptz
            )`,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(monitors.id, monitorId),
        eq(monitors.isActive, true),
        isNull(monitors.deletedAt),
        expectedLeaseToken ? eq(monitors.leaseToken, expectedLeaseToken) : undefined
      )
    )
    .returning();

  return monitor;
}

export async function renewMonitorLease(
  monitorId: string,
  expectedLeaseToken: string | null,
  monitor: Pick<typeof monitors.$inferSelect, "timeout" | "verificationMode">
) {
  if (!expectedLeaseToken) {
    return false;
  }

  const leaseDurationMs = calculateMonitorLeaseMs([monitor]);
  const extendedLeaseTimestamp = new Date(Date.now() + leaseDurationMs).toISOString();
  const [updated] = await db
    .update(monitors)
    .set({
      leaseExpiresAt: sql`greatest(
        coalesce(${monitors.leaseExpiresAt}, now()),
        (${extendedLeaseTimestamp})::timestamptz
      )`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(monitors.id, monitorId),
        eq(monitors.isActive, true),
        isNull(monitors.deletedAt),
        eq(monitors.leaseToken, expectedLeaseToken)
      )
    )
    .returning({ id: monitors.id });

  return Boolean(updated);
}

export async function releaseMonitorLease(monitorId: string, expectedLeaseToken: string | null) {
  if (!expectedLeaseToken) {
    return false;
  }

  const [monitor] = await db
    .update(monitors)
    .set({
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(monitors.id, monitorId), eq(monitors.leaseToken, expectedLeaseToken)))
    .returning({ id: monitors.id });

  return Boolean(monitor);
}

export async function receiveHeartbeat(token: string, receivedAt = new Date()) {
  const normalizedToken = normalizeHeartbeatTokenInput(token);
  if (!normalizedToken) {
    return null;
  }

  return db.transaction(async (tx) => {
    const tokenHash = hashSecretValue("heartbeat-token", normalizedToken);
    const [legacyMonitor] = await tx
      .select()
      .from(monitors)
      .where(and(
        eq(monitors.monitorType, "heartbeat"),
        eq(monitors.heartbeatToken, normalizedToken),
        isNull(monitors.deletedAt)
      ))
      .limit(1);
    const [hashedMonitor] = await tx
      .select()
      .from(monitors)
      .where(and(
        eq(monitors.monitorType, "heartbeat"),
        eq(monitors.heartbeatTokenHash, tokenHash),
        isNull(monitors.deletedAt)
      ))
      .limit(1);
    const foundMonitor = legacyMonitor ?? hashedMonitor;

    if (!foundMonitor) {
      return null;
    }

    const hasLegacyHashConflict = Boolean(
      legacyMonitor && hashedMonitor && legacyMonitor.id !== hashedMonitor.id
    );
    const [migratedMonitor] = hasLegacyHashConflict
      ? []
      : await tx
        .update(monitors)
        .set({
          heartbeatToken: encryptValue(normalizedToken),
          heartbeatTokenHash: tokenHash,
          url: buildHeartbeatMonitorTarget(tokenHash),
          updatedAt: new Date(),
        })
        .where(eq(monitors.id, foundMonitor.id))
        .returning();
    const existingMonitor = migratedMonitor ?? foundMonitor;

    if (!existingMonitor.isActive) {
      return {
        accepted: false,
        paused: true,
        monitor: existingMonitor,
        receivedAt,
      };
    }

    const [monitor] = await tx
      .update(monitors)
      .set({
        heartbeatLastReceivedAt: receivedAt,
        nextCheckAt: receivedAt,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(monitors.id, existingMonitor.id),
        eq(monitors.isActive, true),
        isNull(monitors.deletedAt),
        or(
          isNull(monitors.heartbeatLastReceivedAt),
          lte(monitors.heartbeatLastReceivedAt, receivedAt)
        )
      ))
      .returning();

    if (!monitor) {
      const [currentMonitor] = await tx
        .select()
        .from(monitors)
        .where(and(
          eq(monitors.id, existingMonitor.id),
          or(
            eq(monitors.heartbeatTokenHash, tokenHash),
            eq(monitors.heartbeatToken, normalizedToken)
          ),
          isNull(monitors.deletedAt)
        ))
        .limit(1);

      return currentMonitor?.isActive
        ? { accepted: true, paused: false, monitor: currentMonitor, receivedAt }
        : { accepted: false, paused: true, monitor: currentMonitor ?? existingMonitor, receivedAt };
    }

    await appendMonitorEvent({
      monitorId: monitor.id,
      userId: monitor.userId,
      eventType: "heartbeat-received",
      status: monitor.status,
      statusCode: monitor.statusCode,
      latencyMs: null,
      message: "Heartbeat ping received from the external job.",
    }, tx);

    return {
      accepted: true,
      paused: false,
      monitor,
      receivedAt,
    };
  });
}

export function normalizeHeartbeatTokenInput(token: string) {
  const normalized = token.trim();
  if (
    normalized.length < MIN_HEARTBEAT_TOKEN_LENGTH ||
    normalized.length > MAX_HEARTBEAT_TOKEN_LENGTH
  ) {
    return null;
  }

  return normalized;
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
}, database: DatabaseExecutor = db) {
  await database.insert(monitorEvents).values({
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

export async function getRecentMonitorEventMessage(input: {
  monitorId: string;
  eventType: string;
  since: Date;
  before: Date;
}) {
  const [event] = await db
    .select({ message: monitorEvents.message })
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

  return event?.message ?? null;
}

export async function countMonitorEvents(input: {
  monitorId: string;
  eventType: string;
  since: Date;
  before: Date;
}) {
  const [row] = await db
    .select({ total: count() })
    .from(monitorEvents)
    .where(
      and(
        eq(monitorEvents.monitorId, input.monitorId),
        eq(monitorEvents.eventType, input.eventType),
        gte(monitorEvents.createdAt, input.since),
        lte(monitorEvents.createdAt, input.before)
      )
    );

  return row?.total ?? 0;
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

export async function appendMonitorDiagnostic(input: {
  monitorId: string;
  userId: string;
  diagnostic: MonitorDiagnosticResult;
}) {
  await db.insert(monitorDiagnostics).values({
    monitorId: input.monitorId,
    userId: input.userId,
    status: input.diagnostic.status,
    failedPhase: input.diagnostic.failedPhase,
    failureCategory: input.diagnostic.failureCategory,
    summary: input.diagnostic.summary,
    dnsStatus: input.diagnostic.dnsStatus,
    resolvedIps: input.diagnostic.resolvedIps,
    tcpStatus: input.diagnostic.tcpStatus,
    tlsStatus: input.diagnostic.tlsStatus,
    httpStatus: input.diagnostic.httpStatus,
    httpStatusCode: input.diagnostic.httpStatusCode,
    responseTimeMs: input.diagnostic.responseTimeMs,
    timeoutMs: input.diagnostic.timeoutMs,
    errorMessage: input.diagnostic.errorMessage,
    createdAt: input.diagnostic.createdAt,
  });
}

export async function appendOutageEvent(input: {
  outageId?: string | null;
  monitorId: string;
  userId: string;
  eventType: string;
  title: string;
  detail?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
}) {
  await db.insert(outageEvents).values({
    outageId: input.outageId ?? null,
    monitorId: input.monitorId,
    userId: input.userId,
    eventType: input.eventType,
    title: input.title,
    detail: input.detail ?? null,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    createdAt: input.createdAt ?? new Date(),
  });
}

export async function listRecentMonitorChecks(userId: string, limitPerMonitor = 12) {
  const rows = await db
    .select()
    .from(monitorChecks)
    .where(eq(monitorChecks.userId, userId))
    .orderBy(desc(monitorChecks.createdAt))
    .limit(Math.max(limitPerMonitor, 1) * 500);

  return groupRecentRowsByMonitor(rows, limitPerMonitor);
}

export async function listRecentMonitorDiagnostics(userId: string, limitPerMonitor = 3) {
  const rows = await db
    .select()
    .from(monitorDiagnostics)
    .where(eq(monitorDiagnostics.userId, userId))
    .orderBy(desc(monitorDiagnostics.createdAt))
    .limit(Math.max(limitPerMonitor, 1) * 500);

  return groupRecentRowsByMonitor(rows, limitPerMonitor);
}

export async function listRecentOutageEvents(userId: string, limitPerMonitor = 8) {
  const rows = await db
    .select()
    .from(outageEvents)
    .where(eq(outageEvents.userId, userId))
    .orderBy(desc(outageEvents.createdAt))
    .limit(Math.max(limitPerMonitor, 1) * 500);

  return groupRecentRowsByMonitor(rows, limitPerMonitor);
}

function groupRecentRowsByMonitor<T extends { monitorId: string }>(rows: T[], limitPerMonitor: number) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const current = grouped.get(row.monitorId) ?? [];
    if (current.length >= limitPerMonitor) {
      continue;
    }

    current.push(row);
    grouped.set(row.monitorId, current);
  }

  return Object.fromEntries(
    Array.from(grouped.entries()).map(([monitorId, items]) => [monitorId, items.reverse()])
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
  if (!company) {
    return null;
  }

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
    .onConflictDoNothing({ target: workerState.id })
    .returning();

  if (created) {
    return created;
  }

  const [existing] = await db.select().from(workerState).where(eq(workerState.id, WORKER_STATE_ID));
  if (!existing) {
    throw new Error("Worker state could not be initialized.");
  }

  return existing;
}

export function summarizeCompanyRecentChecks(
  checks: Array<{ status: string; statusCode: number | null; latencyMs: number | null }>
) {
  const completedChecks = checks.filter((check) => check.status !== "pending");
  const averageLatencyMs = averageValue(completedChecks.map((check) => check.latencyMs).filter(isNumber));
  const statusCodes = buildStatusCodeSummary(
    completedChecks.filter((check) => check.statusCode !== null)
  );

  return { averageLatencyMs, statusCodes };
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
  allowPrivateTargets: boolean,
  database: DatabaseExecutor = db
) {
  const companyRecord =
    input.companyId && input.companyId.length > 0 ? await getCompanyById(userId, input.companyId, database) : null;
  const monitorType = normalizeMonitorType(input.monitorType);
  const heartbeatToken =
    monitorType === "heartbeat" ? resolveHeartbeatToken(input, existingMonitor) : null;
  const heartbeatTokenHash = heartbeatToken
    ? hashSecretValue("heartbeat-token", heartbeatToken)
    : null;
  if (monitorType === "heartbeat" && heartbeatToken && heartbeatTokenHash) {
    await assertHeartbeatTokenAvailable(
      heartbeatToken,
      heartbeatTokenHash,
      existingMonitor?.id ?? null,
      database
    );
  }
  const url = monitorType === "heartbeat"
    ? buildHeartbeatMonitorTarget(heartbeatTokenHash ?? "")
    : buildCanonicalMonitorTarget({
      ...input,
      heartbeatToken: heartbeatToken ?? input.heartbeatToken,
    });
  try {
    await assertMonitorNetworkTargetAllowed(monitorType, url, allowPrivateTargets);
  } catch (error) {
    await recordBlockedMonitorTarget(userId, input.name, monitorType);
    throw error;
  }
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
    notificationLanguage: input.notificationLanguage,
    notifEmail: input.notifEmail,
    telegramBotToken: input.telegramBotToken ? encryptValue(input.telegramBotToken) : null,
    telegramChatId: input.telegramChatId,
    heartbeatToken: heartbeatToken ? encryptValue(heartbeatToken) : null,
    heartbeatTokenHash,
    heartbeatLastReceivedAt:
      monitorType === "heartbeat" ? existingMonitor?.heartbeatLastReceivedAt ?? null : null,
    intervalValue: input.intervalValue,
    intervalUnit: input.intervalUnit,
    timeout: input.timeout,
    slowResponseThresholdMs: shouldPersistSlowResponseThreshold(monitorType, input.slowResponseThresholdMs),
    slowResponseAlertsEnabled: shouldPersistSlowResponseAlerts(monitorType, input.slowResponseAlertsEnabled),
    expectedStatusCodes: shouldPersistExpectedStatusCodes(monitorType, input.expectedStatusCodes),
    retries: input.retries,
    method: monitorType === "port" || monitorType === "postgres" || monitorType === "ping" || monitorType === "heartbeat" ? "GET" : input.method,
    databaseSsl: monitorType === "postgres" ? input.databaseSsl : true,
    databaseTlsVerify: monitorType === "postgres" ? input.databaseTlsVerify : true,
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
    sendOutageScreenshot: shouldPersistOutageScreenshot(monitorType, input.notificationPref, input.sendOutageScreenshot),
    isActive: input.isActive,
    publishOnStatusPage: input.publishOnStatusPage,
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

async function encryptLegacyClaimedSecrets(claimed: Monitor[]) {
  const legacyTelegramTokens = claimed.filter((monitor) =>
    monitor.telegramBotToken && !isEncryptedValue(monitor.telegramBotToken)
  );
  const legacyHeartbeatTokens = claimed.filter((monitor) =>
    monitor.monitorType === "heartbeat"
    && monitor.heartbeatToken
    && !isEncryptedValue(monitor.heartbeatToken)
  );

  await Promise.all(legacyTelegramTokens.map((monitor) =>
    db
      .update(monitors)
      .set({ telegramBotToken: encryptValue(monitor.telegramBotToken as string) })
      .where(eq(monitors.id, monitor.id))
  ));
  await Promise.all(legacyHeartbeatTokens.map(migrateLegacyHeartbeatToken));
}

async function migrateLegacyHeartbeatToken(monitor: Monitor) {
  const token = monitor.heartbeatToken as string;
  const tokenHash = hashSecretValue("heartbeat-token", token);
  try {
    await db
      .update(monitors)
      .set({
        heartbeatToken: encryptValue(token),
        heartbeatTokenHash: tokenHash,
        url: buildHeartbeatMonitorTarget(tokenHash),
      })
      .where(eq(monitors.id, monitor.id));
  } catch (error) {
    console.error(`[sentrovia] Legacy heartbeat token migration deferred for monitor ${monitor.id}.`, error);
  }
}

async function assertHeartbeatTokenAvailable(
  token: string,
  tokenHash: string,
  existingMonitorId: string | null,
  database: DatabaseExecutor
) {
  const [conflict] = await database
    .select({ id: monitors.id })
    .from(monitors)
    .where(and(
      eq(monitors.monitorType, "heartbeat"),
      or(eq(monitors.heartbeatTokenHash, tokenHash), eq(monitors.heartbeatToken, token)),
      existingMonitorId ? ne(monitors.id, existingMonitorId) : undefined
    ))
    .limit(1);
  if (conflict) {
    throw new AuthError("This heartbeat token is already assigned to another monitor.", 409);
  }
}

async function getMonitorById(userId: string, monitorId: string, database: DatabaseExecutor = db) {
  const [monitor] = await database
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, monitorId), eq(monitors.userId, userId), isNull(monitors.deletedAt)));

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

function buildStatusCodeSummary(checks: Array<{ statusCode: number | null }>) {
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
