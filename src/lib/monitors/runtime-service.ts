import crypto from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitors, userSettings, users, type Monitor } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { encryptLegacyClaimedSecrets } from "@/lib/monitors/heartbeat-secrets";
import { calculateVerificationLeaseBudgetMs } from "@/lib/monitors/verification";
import { getMonitorUptimeById, NO_MONITOR_UPTIME_DATA } from "@/lib/monitoring/uptime";
import { decryptValueOrLegacyPlaintext } from "@/lib/security/encryption";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";

const MONITOR_LEASE_MS = Math.max(env.workerPollIntervalMs * 6, 180_000);
const MONITOR_LEASE_SAFETY_MS = 120_000;
const MAX_DUE_USERS_PER_CYCLE = 100;
const DUE_USER_QUERY_CONCURRENCY = 10;

export type ClaimedMonitor = Monitor & { allowPrivateTargets: boolean };

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

export async function refreshMonitorUptime(
  userId: string,
  monitorId: string,
  expectedLeaseToken: string | null,
  now = new Date()
) {
  const uptimeByMonitorId = await getMonitorUptimeById(userId, [monitorId], now);
  const uptime = uptimeByMonitorId.get(monitorId) ?? NO_MONITOR_UPTIME_DATA;
  const [updated] = await db
    .update(monitors)
    .set({ uptime, updatedAt: new Date() })
    .where(and(
      eq(monitors.id, monitorId),
      eq(monitors.userId, userId),
      eq(monitors.isActive, true),
      isNull(monitors.deletedAt),
      expectedLeaseToken ? eq(monitors.leaseToken, expectedLeaseToken) : undefined
    ))
    .returning({ id: monitors.id });

  return updated?.id === monitorId;
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

