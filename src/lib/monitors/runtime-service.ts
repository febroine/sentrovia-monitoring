import crypto from "node:crypto";
import { and, asc, count, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitors, userSettings, workspaceMembers, workspaceSettings, type Monitor } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { encryptLegacyClaimedSecrets } from "@/lib/monitors/heartbeat-secrets";
import { calculateVerificationLeaseBudgetMs } from "@/lib/monitors/verification";
import { getMonitorUptimeById, NO_MONITOR_UPTIME_DATA } from "@/lib/monitoring/uptime";
import { decryptValueOrLegacyPlaintext } from "@/lib/security/encryption";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";

const MONITOR_LEASE_MS = Math.max(env.workerPollIntervalMs * 6, 180_000);
const MONITOR_LEASE_SAFETY_MS = 120_000;
const MAX_DUE_WORKSPACES_PER_CYCLE = 100;
const DUE_WORKSPACE_QUERY_CONCURRENCY = 10;

export type ClaimedMonitor = Monitor & { allowPrivateTargets: boolean };

export async function claimDueMonitors(now: Date): Promise<ClaimedMonitor[]> {
  const dueWorkspaces = await db
    .select({ workspaceId: monitors.workspaceId })
    .from(monitors)
    .where(buildDueMonitorPredicate(now))
    .groupBy(monitors.workspaceId)
    .orderBy(asc(sql`min(coalesce(${monitors.nextCheckAt}, ${monitors.createdAt}))`))
    .limit(MAX_DUE_WORKSPACES_PER_CYCLE);

  if (dueWorkspaces.length === 0) {
    return [];
  }

  const workspaceIds = dueWorkspaces.map((row) => row.workspaceId);
  const [settingsRows, legacySettingsRows] = await Promise.all([
    db
      .select({ workspaceId: workspaceSettings.workspaceId, values: workspaceSettings.valuesJson })
      .from(workspaceSettings)
      .where(inArray(workspaceSettings.workspaceId, workspaceIds)),
    db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
        memberCreatedAt: workspaceMembers.createdAt,
        batchSize: userSettings.monitoringBatchSize,
      })
      .from(workspaceMembers)
      .leftJoin(userSettings, eq(userSettings.userId, workspaceMembers.userId))
      .where(inArray(workspaceMembers.workspaceId, workspaceIds))
      .orderBy(
        asc(workspaceMembers.workspaceId),
        asc(sql`case ${workspaceMembers.role}
          when 'admin' then 0
          when 'manager' then 1
          when 'operator' then 2
          else 3
        end`),
        asc(workspaceMembers.createdAt),
        asc(workspaceMembers.userId)
      ),
  ]);
  const settingsByWorkspace = new Map(settingsRows.map((row) => [row.workspaceId, row.values]));
  const legacyBatchSizeByWorkspace = new Map<string, number | null>();
  for (const row of legacySettingsRows) {
    if (!legacyBatchSizeByWorkspace.has(row.workspaceId)) {
      legacyBatchSizeByWorkspace.set(row.workspaceId, row.batchSize);
    }
  }
  const batchSizeByWorkspace = new Map(workspaceIds.map((workspaceId) => [
    workspaceId,
    resolveMonitorBatchSize(
      settingsByWorkspace.has(workspaceId) ? settingsByWorkspace.get(workspaceId)! : null,
      legacyBatchSizeByWorkspace.get(workspaceId)
    ),
  ]));
  const selectedRows = (await mapWithConcurrency(
    workspaceIds,
    DUE_WORKSPACE_QUERY_CONCURRENCY,
    (workspaceId) => db
      .select()
      .from(monitors)
      .where(and(eq(monitors.workspaceId, workspaceId), buildDueMonitorPredicate(now)))
      .orderBy(desc(monitors.verificationMode), asc(monitors.nextCheckAt), asc(monitors.createdAt))
      .limit(batchSizeByWorkspace.get(workspaceId) ?? DEFAULT_SETTINGS.monitoring.batchSize)
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
        buildMonitorRunnablePredicate(now),
        or(lte(monitors.nextCheckAt, now), isNull(monitors.nextCheckAt)),
        or(lte(monitors.leaseExpiresAt, now), isNull(monitors.leaseExpiresAt))
      )
    )
    .returning();

  const claimedUserIds = Array.from(new Set(claimed.map((monitor) => monitor.userId)));
  const membershipRows = await db
    .select({ userId: workspaceMembers.userId, workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(inArray(workspaceMembers.userId, claimedUserIds));

  await encryptLegacyClaimedSecrets(claimed);

  return claimed.map((monitor): ClaimedMonitor => ({
    ...monitor,
    heartbeatToken: decryptValueOrLegacyPlaintext(monitor.heartbeatToken),
    telegramBotToken: decryptValueOrLegacyPlaintext(monitor.telegramBotToken),
    allowPrivateTargets: env.monitorAllowPrivateTargets && hasPrivateTargetAccess(monitor, membershipRows),
  }));
}

export function resolveMonitorBatchSize(
  workspaceValues: Record<string, unknown> | null,
  legacyBatchSize: number | null | undefined
) {
  const configured = workspaceValues === null
    ? legacyBatchSize
    : workspaceValues.monitoringBatchSize ?? workspaceValues.monitoring_batch_size;
  const batchSize = typeof configured === "number" ? configured : Number(configured);

  return Number.isInteger(batchSize) && batchSize >= 1 && batchSize <= 500
    ? batchSize
    : DEFAULT_SETTINGS.monitoring.batchSize;
}

export function hasPrivateTargetAccess(
  monitor: Pick<Monitor, "userId" | "workspaceId">,
  memberships: Array<{ userId: string; workspaceId: string; role: string }>
) {
  return memberships.some((membership) =>
    membership.userId === monitor.userId
    && membership.workspaceId === monitor.workspaceId
    && membership.role === "admin"
  );
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
    buildMonitorRunnablePredicate(now),
    or(lte(monitors.nextCheckAt, now), isNull(monitors.nextCheckAt)),
    or(lte(monitors.leaseExpiresAt, now), isNull(monitors.leaseExpiresAt))
  );
}

function buildMonitorRunnablePredicate(now: Date) {
  return or(isNull(monitors.pausedUntil), lte(monitors.pausedUntil, now));
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
  const now = new Date();
  const [monitor] = await db
    .select({ isActive: monitors.isActive })
    .from(monitors)
    .where(and(
      eq(monitors.id, monitorId),
      eq(monitors.isActive, true),
      isNull(monitors.deletedAt),
      buildMonitorRunnablePredicate(now)
    ))
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
  const leaseCheckTime = new Date();
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
        buildMonitorRunnablePredicate(leaseCheckTime),
        expectedLeaseToken ? eq(monitors.leaseToken, expectedLeaseToken) : undefined,
        expectedLeaseToken ? gt(monitors.leaseExpiresAt, leaseCheckTime) : undefined
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
  const leaseCheckTime = new Date();
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
      buildMonitorRunnablePredicate(leaseCheckTime),
      expectedLeaseToken ? eq(monitors.leaseToken, expectedLeaseToken) : undefined,
      expectedLeaseToken ? gt(monitors.leaseExpiresAt, leaseCheckTime) : undefined
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
  const leaseCheckTime = new Date();
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
        buildMonitorRunnablePredicate(leaseCheckTime),
        eq(monitors.leaseToken, expectedLeaseToken),
        gt(monitors.leaseExpiresAt, leaseCheckTime)
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
