import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitorChecks, monitorEvents, monitors, workerCycleMetrics } from "@/lib/db/schema";
import type {
  SiteStatus,
  WorkerObservability,
  WorkerObservabilityRange,
} from "@/lib/monitors/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const RANGE_CONFIG: Record<
  WorkerObservabilityRange,
  {
    lookbackMs: number;
    bucketCount: number;
    bucketMs: number;
    staleThresholdMs: number;
  }
> = {
  "1h": {
    lookbackMs: HOUR_MS,
    bucketCount: 6,
    bucketMs: 10 * 60 * 1000,
    staleThresholdMs: 20 * 60 * 1000,
  },
  "24h": {
    lookbackMs: DAY_MS,
    bucketCount: 8,
    bucketMs: 3 * HOUR_MS,
    staleThresholdMs: 2 * HOUR_MS,
  },
  "7d": {
    lookbackMs: 7 * DAY_MS,
    bucketCount: 7,
    bucketMs: DAY_MS,
    staleThresholdMs: 12 * HOUR_MS,
  },
};
const RECENT_CYCLE_LIMIT = 18;
const OBSERVABILITY_LIMITS: Record<WorkerObservabilityRange, { checks: number; cycles: number }> = {
  "1h": { checks: 1_500, cycles: 500 },
  "24h": { checks: 8_000, cycles: 1_500 },
  "7d": { checks: 16_000, cycles: 3_000 },
};

export async function recordWorkerCycleMetric(input: {
  cycleStartedAt: Date;
  cycleFinishedAt: Date;
  durationMs: number;
  backlogAtStart: number;
  claimedMonitors: number;
  completedMonitors: number;
  successCount: number;
  failureCount: number;
  pendingCount: number;
  averageLatencyMs: number | null;
  maxLatencyMs: number | null;
  errorMessage?: string | null;
}) {
  await db.insert(workerCycleMetrics).values({
    cycleStartedAt: input.cycleStartedAt,
    cycleFinishedAt: input.cycleFinishedAt,
    durationMs: input.durationMs,
    backlogAtStart: input.backlogAtStart,
    claimedMonitors: input.claimedMonitors,
    completedMonitors: input.completedMonitors,
    successCount: input.successCount,
    failureCount: input.failureCount,
    pendingCount: input.pendingCount,
    averageLatencyMs: input.averageLatencyMs,
    maxLatencyMs: input.maxLatencyMs,
    errorMessage: input.errorMessage ?? null,
  });
}

export async function getWorkerObservability(
  userId: string,
  state: {
    lastCycleDurationMs: number | null;
    lastCycleMonitorCount: number;
    lastCycleSuccessCount: number;
    lastCycleFailureCount: number;
    lastCyclePendingCount: number;
    lastCycleAverageLatencyMs: number | null;
  },
  range: WorkerObservabilityRange = "24h"
): Promise<WorkerObservability> {
  const config = RANGE_CONFIG[range];
  const limits = OBSERVABILITY_LIMITS[range];
  const now = new Date();
  const rangeStart = new Date(now.getTime() - config.lookbackMs);

  const [
    dueRows,
    monitorRows,
    checksInRange,
    failureEvents,
    recentCycleRows,
    recentCycleErrors,
  ] = await Promise.all([
    db
      .select({ id: monitors.id })
      .from(monitors)
      .where(
        and(
          eq(monitors.userId, userId),
          eq(monitors.isActive, true),
          or(lte(monitors.nextCheckAt, now), isNull(monitors.nextCheckAt)),
          or(lte(monitors.leaseExpiresAt, now), isNull(monitors.leaseExpiresAt))
        )
      ),
    db
      .select({
        id: monitors.id,
        name: monitors.name,
        status: monitors.status,
        lastCheckedAt: monitors.lastCheckedAt,
        nextCheckAt: monitors.nextCheckAt,
      })
      .from(monitors)
      .where(and(eq(monitors.userId, userId), eq(monitors.isActive, true)))
      .orderBy(desc(monitors.updatedAt)),
    db
      .select({
        monitorId: monitorChecks.monitorId,
        status: monitorChecks.status,
        statusCode: monitorChecks.statusCode,
        latencyMs: monitorChecks.latencyMs,
        createdAt: monitorChecks.createdAt,
      })
      .from(monitorChecks)
      .where(and(eq(monitorChecks.userId, userId), gte(monitorChecks.createdAt, rangeStart)))
      .orderBy(desc(monitorChecks.createdAt))
      .limit(limits.checks),
    db
      .select({
        monitorId: monitorEvents.monitorId,
        createdAt: monitorEvents.createdAt,
        rcaType: monitorEvents.rcaType,
      })
      .from(monitorEvents)
      .where(
        and(
          eq(monitorEvents.userId, userId),
          eq(monitorEvents.eventType, "failure"),
          gte(monitorEvents.createdAt, rangeStart)
        )
      )
      .orderBy(desc(monitorEvents.createdAt))
      .limit(limits.checks),
    db
      .select()
      .from(workerCycleMetrics)
      .where(gte(workerCycleMetrics.createdAt, rangeStart))
      .orderBy(desc(workerCycleMetrics.createdAt))
      .limit(limits.cycles),
    db
      .select({
        errorMessage: workerCycleMetrics.errorMessage,
        createdAt: workerCycleMetrics.createdAt,
      })
      .from(workerCycleMetrics)
      .where(gte(workerCycleMetrics.createdAt, rangeStart))
      .orderBy(desc(workerCycleMetrics.createdAt))
      .limit(20),
  ]);

  const chronologicalChecks = [...checksInRange].reverse();
  const latencyByMonitor = new Map<string, number[]>();
  const failureByMonitor = new Map<string, Date[]>();
  const transitionsByMonitor = new Map<
    string,
    { transitionCount: number; lastStatus: string | null; lastStatusChangeAt: Date | null }
  >();
  const failureReasonCounts = new Map<string, number>();
  const trend = createTrendBuckets(range, rangeStart, config);

  for (const check of chronologicalChecks) {
    appendLatencySample(latencyByMonitor, check.monitorId, check.latencyMs);
    trackMonitorTransition(transitionsByMonitor, check.monitorId, check.status, check.createdAt);
    incrementTrendChecks(trend, check.createdAt, config, rangeStart);
  }

  for (const failure of failureEvents) {
    const currentFailures = failureByMonitor.get(failure.monitorId) ?? [];
    currentFailures.push(failure.createdAt);
    failureByMonitor.set(failure.monitorId, currentFailures);
    incrementMapCount(failureReasonCounts, formatFailureReason(failure.rcaType));
    incrementTrendFailures(trend, failure.createdAt, config, rangeStart);
  }

  for (const cycle of recentCycleRows) {
    appendTrendCycle(trend, cycle.cycleFinishedAt, cycle.durationMs, config, rangeStart);
  }

  const slowMonitors = monitorRows
    .map((monitor) => {
      const samples = latencyByMonitor.get(monitor.id) ?? [];
      return {
        monitorId: monitor.id,
        name: monitor.name,
        status: monitor.status as SiteStatus,
        averageLatencyMs: averageValue(samples),
        sampleCount: samples.length,
      };
    })
    .filter((monitor) => monitor.sampleCount > 0)
    .sort((left, right) => right.averageLatencyMs - left.averageLatencyMs)
    .slice(0, 5);

  const failingMonitors = monitorRows
    .map((monitor) => {
      const failures = failureByMonitor.get(monitor.id) ?? [];
      const lastFailure = getLatestDate(failures);
      return {
        monitorId: monitor.id,
        name: monitor.name,
        status: monitor.status as SiteStatus,
        failureCount: failures.length,
        lastFailureAt: lastFailure?.toISOString() ?? null,
      };
    })
    .filter((monitor) => monitor.failureCount > 0)
    .sort((left, right) => right.failureCount - left.failureCount)
    .slice(0, 5);

  const unstableMonitors = monitorRows
    .map((monitor) => {
      const transitions = transitionsByMonitor.get(monitor.id);
      return {
        monitorId: monitor.id,
        name: monitor.name,
        status: monitor.status as SiteStatus,
        transitionCount: transitions?.transitionCount ?? 0,
        lastStatusChangeAt: transitions?.lastStatusChangeAt?.toISOString() ?? null,
      };
    })
    .filter((monitor) => monitor.transitionCount > 0)
    .sort((left, right) => right.transitionCount - left.transitionCount)
    .slice(0, 5);

  const staleMonitors = monitorRows
    .map((monitor) => {
      const minutesSinceLastCheck = monitor.lastCheckedAt
        ? Math.floor((now.getTime() - monitor.lastCheckedAt.getTime()) / 60_000)
        : null;
      const stale =
        monitor.lastCheckedAt === null ||
        now.getTime() - monitor.lastCheckedAt.getTime() >= config.staleThresholdMs;

      return {
        monitorId: monitor.id,
        name: monitor.name,
        status: monitor.status as SiteStatus,
        stale,
        minutesSinceLastCheck,
        lastCheckedAt: monitor.lastCheckedAt?.toISOString() ?? null,
      };
    })
    .filter((monitor) => monitor.stale)
    .sort((left, right) => staleSortValue(right.minutesSinceLastCheck) - staleSortValue(left.minutesSinceLastCheck))
    .slice(0, 5)
    .map((monitor) => ({
      monitorId: monitor.monitorId,
      name: monitor.name,
      status: monitor.status,
      minutesSinceLastCheck: monitor.minutesSinceLastCheck,
      lastCheckedAt: monitor.lastCheckedAt,
    }));

  return {
    range,
    summary: {
      dueBacklog: dueRows.length,
      checksInRange: checksInRange.length,
      failuresInRange: failureEvents.length,
      averageLatencyMsInRange: averageValue(
        checksInRange
          .map((check) => check.latencyMs)
          .filter((value): value is number => typeof value === "number")
      ),
      lastCycleDurationMs: state.lastCycleDurationMs,
      lastCycleMonitorCount: state.lastCycleMonitorCount,
      lastCycleSuccessCount: state.lastCycleSuccessCount,
      lastCycleFailureCount: state.lastCycleFailureCount,
      lastCyclePendingCount: state.lastCyclePendingCount,
      lastCycleAverageLatencyMs: state.lastCycleAverageLatencyMs,
    },
    recentCycles: recentCycleRows.slice(0, RECENT_CYCLE_LIMIT).map((cycle) => ({
      id: cycle.id,
      cycleStartedAt: cycle.cycleStartedAt.toISOString(),
      cycleFinishedAt: cycle.cycleFinishedAt.toISOString(),
      durationMs: cycle.durationMs,
      backlogAtStart: cycle.backlogAtStart,
      claimedMonitors: cycle.claimedMonitors,
      completedMonitors: cycle.completedMonitors,
      successCount: cycle.successCount,
      failureCount: cycle.failureCount,
      pendingCount: cycle.pendingCount,
      averageLatencyMs: cycle.averageLatencyMs,
      maxLatencyMs: cycle.maxLatencyMs,
      errorMessage: cycle.errorMessage,
    })),
    trend: trend.map((bucket) => ({
      label: bucket.label,
      checks: bucket.checks,
      failures: bucket.failures,
      averageCycleDurationMs: bucket.cycleCount > 0 ? Math.round(bucket.cycleDurationTotal / bucket.cycleCount) : 0,
    })),
    slowMonitors,
    failingMonitors,
    unstableMonitors,
    staleMonitors,
    failureReasons: Array.from(failureReasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 6),
    recentErrors: recentCycleErrors
      .filter((cycle) => cycle.errorMessage)
      .slice(0, 6)
      .map((cycle) => ({
        message: cycle.errorMessage ?? "Unknown worker error.",
        createdAt: cycle.createdAt.toISOString(),
      })),
  };
}

function appendLatencySample(latencyByMonitor: Map<string, number[]>, monitorId: string, latencyMs: number | null) {
  if (typeof latencyMs !== "number") {
    return;
  }

  const current = latencyByMonitor.get(monitorId) ?? [];
  current.push(latencyMs);
  latencyByMonitor.set(monitorId, current);
}

function trackMonitorTransition(
  transitionsByMonitor: Map<
    string,
    { transitionCount: number; lastStatus: string | null; lastStatusChangeAt: Date | null }
  >,
  monitorId: string,
  status: string,
  createdAt: Date
) {
  if (status === "pending") {
    return;
  }

  const current = transitionsByMonitor.get(monitorId) ?? {
    transitionCount: 0,
    lastStatus: null,
    lastStatusChangeAt: null,
  };

  if (current.lastStatus && current.lastStatus !== status) {
    current.transitionCount += 1;
    current.lastStatusChangeAt = createdAt;
  }

  current.lastStatus = status;
  transitionsByMonitor.set(monitorId, current);
}

function createTrendBuckets(
  range: WorkerObservabilityRange,
  rangeStart: Date,
  config: { bucketCount: number; bucketMs: number }
) {
  return Array.from({ length: config.bucketCount }, (_, index) => {
    const bucketStart = new Date(rangeStart.getTime() + index * config.bucketMs);
    return {
      label: formatTrendLabel(range, bucketStart),
      checks: 0,
      failures: 0,
      cycleDurationTotal: 0,
      cycleCount: 0,
    };
  });
}

function incrementTrendChecks(
  trend: Array<{ checks: number }>,
  createdAt: Date,
  config: { bucketCount: number; bucketMs: number },
  rangeStart: Date
) {
  const index = resolveBucketIndex(createdAt, config, rangeStart);
  if (index !== null) {
    trend[index].checks += 1;
  }
}

function incrementTrendFailures(
  trend: Array<{ failures: number }>,
  createdAt: Date,
  config: { bucketCount: number; bucketMs: number },
  rangeStart: Date
) {
  const index = resolveBucketIndex(createdAt, config, rangeStart);
  if (index !== null) {
    trend[index].failures += 1;
  }
}

function appendTrendCycle(
  trend: Array<{ cycleDurationTotal: number; cycleCount: number }>,
  createdAt: Date,
  durationMs: number,
  config: { bucketCount: number; bucketMs: number },
  rangeStart: Date
) {
  const index = resolveBucketIndex(createdAt, config, rangeStart);
  if (index !== null) {
    trend[index].cycleDurationTotal += durationMs;
    trend[index].cycleCount += 1;
  }
}

function resolveBucketIndex(
  createdAt: Date,
  config: { bucketCount: number; bucketMs: number },
  rangeStart: Date
) {
  const elapsed = createdAt.getTime() - rangeStart.getTime();
  if (elapsed < 0) {
    return null;
  }

  const index = Math.floor(elapsed / config.bucketMs);
  if (index < 0 || index >= config.bucketCount) {
    return null;
  }

  return index;
}

function formatTrendLabel(range: WorkerObservabilityRange, bucketStart: Date) {
  if (range === "7d") {
    return bucketStart.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return bucketStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function incrementMapCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function formatFailureReason(reason: string | null) {
  if (!reason) {
    return "Unknown";
  }

  return reason
    .replaceAll("_", " ")
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

export function getLatestDate(values: Date[]) {
  return values.reduce<Date | null>(
    (latest, value) => (!latest || value.getTime() > latest.getTime() ? value : latest),
    null
  );
}

function staleSortValue(minutesSinceLastCheck: number | null) {
  return minutesSinceLastCheck ?? Number.POSITIVE_INFINITY;
}

function averageValue(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}
