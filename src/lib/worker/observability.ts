import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitorChecks, monitorEvents, monitors, workerCycleMetrics } from "@/lib/db/schema";
import type { WorkerObservability } from "@/lib/monitors/types";

const LOOKBACK_24H_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_1H_MS = 60 * 60 * 1000;

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

export async function getWorkerObservability(userId: string, state: {
  lastCycleDurationMs: number | null;
  lastCycleMonitorCount: number;
  lastCycleSuccessCount: number;
  lastCycleFailureCount: number;
  lastCyclePendingCount: number;
  lastCycleAverageLatencyMs: number | null;
}): Promise<WorkerObservability> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - LOOKBACK_1H_MS);
  const oneDayAgo = new Date(now.getTime() - LOOKBACK_24H_MS);

  const [dueRows, monitorRows, checksLastHour, lastDayChecks, lastDayFailures, recentCycles, recentCycleErrors] =
    await Promise.all([
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
        })
        .from(monitors)
        .where(eq(monitors.userId, userId)),
      db
        .select({
          id: monitorChecks.id,
        })
        .from(monitorChecks)
        .where(and(eq(monitorChecks.userId, userId), gte(monitorChecks.createdAt, oneHourAgo))),
      db
        .select({
          monitorId: monitorChecks.monitorId,
          latencyMs: monitorChecks.latencyMs,
        })
        .from(monitorChecks)
        .where(and(eq(monitorChecks.userId, userId), gte(monitorChecks.createdAt, oneDayAgo)))
        .orderBy(desc(monitorChecks.createdAt))
        .limit(6_000),
      db
        .select({
          monitorId: monitorEvents.monitorId,
          createdAt: monitorEvents.createdAt,
        })
        .from(monitorEvents)
        .where(
          and(
            eq(monitorEvents.userId, userId),
            eq(monitorEvents.eventType, "failure"),
            gte(monitorEvents.createdAt, oneDayAgo)
          )
        )
        .orderBy(desc(monitorEvents.createdAt))
        .limit(2_000),
      db
        .select()
        .from(workerCycleMetrics)
        .orderBy(desc(workerCycleMetrics.createdAt))
        .limit(8),
      db
        .select({
          errorMessage: workerCycleMetrics.errorMessage,
          createdAt: workerCycleMetrics.createdAt,
        })
        .from(workerCycleMetrics)
        .where(gte(workerCycleMetrics.createdAt, oneDayAgo))
        .orderBy(desc(workerCycleMetrics.createdAt))
        .limit(20),
    ]);

  const latencyByMonitor = new Map<string, number[]>();
  const failureByMonitor = new Map<string, Array<Date>>();

  for (const check of lastDayChecks) {
    if (typeof check.latencyMs !== "number") {
      continue;
    }

    const current = latencyByMonitor.get(check.monitorId) ?? [];
    current.push(check.latencyMs);
    latencyByMonitor.set(check.monitorId, current);
  }

  for (const failure of lastDayFailures) {
    const current = failureByMonitor.get(failure.monitorId) ?? [];
    current.push(failure.createdAt);
    failureByMonitor.set(failure.monitorId, current);
  }

  const slowMonitors = monitorRows
    .map((monitor) => {
      const samples = latencyByMonitor.get(monitor.id) ?? [];
      return {
        monitorId: monitor.id,
        name: monitor.name,
        status: monitor.status as WorkerObservability["slowMonitors"][number]["status"],
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
      return {
        monitorId: monitor.id,
        name: monitor.name,
        status: monitor.status as WorkerObservability["failingMonitors"][number]["status"],
        failureCount: failures.length,
        lastFailureAt: failures[0]?.toISOString() ?? null,
      };
    })
    .filter((monitor) => monitor.failureCount > 0)
    .sort((left, right) => right.failureCount - left.failureCount)
    .slice(0, 5);

  return {
    summary: {
      dueBacklog: dueRows.length,
      checksLastHour: checksLastHour.length,
      failuresLast24Hours: lastDayFailures.length,
      averageLatencyMs24Hours: averageValue(
        lastDayChecks
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
    recentCycles: recentCycles.map((cycle) => ({
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
    slowMonitors,
    failingMonitors,
    recentErrors: recentCycleErrors
      .filter((cycle) => cycle.errorMessage)
      .slice(0, 5)
      .map((cycle) => ({
        message: cycle.errorMessage ?? "Unknown worker error.",
        createdAt: cycle.createdAt.toISOString(),
      })),
  };
}

function averageValue(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}
