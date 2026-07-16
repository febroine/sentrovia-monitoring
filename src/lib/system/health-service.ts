import { and, desc, eq, gte, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { deliveryEvents, monitors } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getWorkerState } from "@/lib/monitors/service";
import { getMonitorTargetDisplay } from "@/lib/monitors/targets";
import { intervalToMs } from "@/lib/monitors/utils";
import { isPidAlive } from "@/lib/worker/process";

const DAY_MS = 24 * 60 * 60_000;
const MIN_DELAY_GRACE_MS = 60_000;
const RECENT_FAILURE_LIMIT = 12;
const DELAYED_MONITOR_LIMIT = 12;
const NON_NOTIFICATION_KINDS = ["report", "test"];

export interface SystemHealthAlarm {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
}

export async function getSystemHealth() {
  const now = new Date();
  const lookbackStart = new Date(now.getTime() - DAY_MS);
  const worker = await getWorkerState();

  const [monitorRows, deliveryCountRows, recentFailureRows] = await Promise.all([
    db
      .select()
      .from(monitors)
      .where(eq(monitors.isActive, true)),
    db
      .select({
        failed: sql<number>`count(*) filter (where ${deliveryEvents.status} = 'failed')::int`,
        queued: sql<number>`count(*) filter (where ${deliveryEvents.status} in ('pending', 'retrying', 'processing'))::int`,
      })
      .from(deliveryEvents)
      .where(
        and(
          gte(deliveryEvents.createdAt, lookbackStart),
          notInArray(deliveryEvents.kind, NON_NOTIFICATION_KINDS)
        )
      ),
    db
      .select({
        id: deliveryEvents.id,
        channel: deliveryEvents.channel,
        kind: deliveryEvents.kind,
        destination: deliveryEvents.destination,
        status: deliveryEvents.status,
        attempts: deliveryEvents.attempts,
        errorMessage: deliveryEvents.errorMessage,
        lastAttemptAt: deliveryEvents.lastAttemptAt,
        nextRetryAt: deliveryEvents.nextRetryAt,
        createdAt: deliveryEvents.createdAt,
      })
      .from(deliveryEvents)
      .where(
        and(
          gte(deliveryEvents.createdAt, lookbackStart),
          notInArray(deliveryEvents.kind, NON_NOTIFICATION_KINDS),
          eq(deliveryEvents.status, "failed")
        )
      )
      .orderBy(desc(deliveryEvents.createdAt))
      .limit(RECENT_FAILURE_LIMIT),
  ]);

  const allDelayedMonitors = monitorRows
    .map((monitor) => toDelayedMonitor(monitor, now))
    .filter((monitor): monitor is NonNullable<typeof monitor> => monitor !== null)
    .sort((left, right) => right.delayMs - left.delayMs);
  const delayedMonitors = allDelayedMonitors.slice(0, DELAYED_MONITOR_LIMIT);
  const deliveryCounts = deliveryCountRows[0];
  const failedDeliveryCount = deliveryCounts?.failed ?? 0;
  const queuedDeliveryCount = deliveryCounts?.queued ?? 0;
  const staleThresholdMs = Math.max(env.workerPollIntervalMs * 6, 180_000);
  const heartbeatAgeMs = worker.heartbeatAt
    ? Math.max(0, now.getTime() - worker.heartbeatAt.getTime())
    : null;
  const processAlive = env.disableEmbeddedWorkerSpawn
    ? heartbeatAgeMs !== null && heartbeatAgeMs <= staleThresholdMs
    : isPidAlive(worker.pid);
  const workerHealthy =
    worker.desiredState !== "running" ||
    (worker.running && processAlive && heartbeatAgeMs !== null && heartbeatAgeMs <= staleThresholdMs);
  const alarms = buildSystemHealthAlarms({
    workerDesiredState: worker.desiredState,
    workerHealthy,
    heartbeatAgeMs,
    delayedMonitorCount: allDelayedMonitors.length,
    failedDeliveryCount,
    queuedDeliveryCount,
  });

  return {
    generatedAt: now.toISOString(),
    overallStatus: alarms.some((alarm) => alarm.severity === "critical")
      ? "critical"
      : alarms.length > 0
        ? "attention"
        : "healthy",
    alarms,
    worker: {
      desiredState: worker.desiredState,
      running: worker.running,
      processAlive,
      heartbeatAt: worker.heartbeatAt?.toISOString() ?? null,
      heartbeatAgeMs,
      lastCycleAt: worker.lastCycleAt?.toISOString() ?? null,
      lastCycleDurationMs: worker.lastCycleDurationMs,
      lastCycleBacklog: worker.lastCycleBacklog,
      lastErrorAt: worker.lastErrorAt?.toISOString() ?? null,
      lastErrorMessage: worker.lastErrorMessage,
    },
    queue: {
      dueBacklog: monitorRows.filter((monitor) => isMonitorDue(monitor, now)).length,
      delayedMonitorCount: allDelayedMonitors.length,
      delayedMonitors,
    },
    delivery: {
      failedLast24Hours: failedDeliveryCount,
      queuedLast24Hours: queuedDeliveryCount,
      recentFailures: recentFailureRows.map((event) => ({
        ...event,
        lastAttemptAt: event.lastAttemptAt?.toISOString() ?? null,
        nextRetryAt: event.nextRetryAt?.toISOString() ?? null,
        createdAt: event.createdAt.toISOString(),
      })),
    },
  };
}

function isMonitorDue(monitor: typeof monitors.$inferSelect, now: Date) {
  const due = monitor.nextCheckAt === null || monitor.nextCheckAt <= now;
  const leaseAvailable = monitor.leaseExpiresAt === null || monitor.leaseExpiresAt <= now;
  return due && leaseAvailable;
}

function toDelayedMonitor(
  monitor: typeof monitors.$inferSelect,
  now: Date
) {
  const dueAt = monitor.nextCheckAt ?? monitor.createdAt;
  const graceMs = Math.max(
    intervalToMs(monitor.intervalValue, monitor.intervalUnit),
    MIN_DELAY_GRACE_MS
  );
  const delayMs = now.getTime() - dueAt.getTime();

  if (delayMs <= graceMs) {
    return null;
  }

  return {
    id: monitor.id,
    name: monitor.name,
    target: getMonitorTargetDisplay(monitor),
    dueAt: dueAt.toISOString(),
    delayMs,
    verificationMode: monitor.verificationMode,
  };
}

export function buildSystemHealthAlarms(input: {
  workerDesiredState: string;
  workerHealthy: boolean;
  heartbeatAgeMs: number | null;
  delayedMonitorCount: number;
  failedDeliveryCount: number;
  queuedDeliveryCount: number;
}): SystemHealthAlarm[] {
  const alarms: SystemHealthAlarm[] = [];

  if (input.workerDesiredState === "running" && !input.workerHealthy) {
    alarms.push({
      id: "worker-unhealthy",
      severity: "critical",
      title: "Worker is not healthy",
      detail: input.heartbeatAgeMs === null
        ? "The worker is expected to run but has not reported a heartbeat."
        : `The last worker heartbeat is ${formatDuration(input.heartbeatAgeMs)} old.`,
    });
  }

  if (input.delayedMonitorCount > 0) {
    alarms.push({
      id: "checks-delayed",
      severity: input.delayedMonitorCount >= 10 ? "critical" : "warning",
      title: "Monitor checks are delayed",
      detail: `${input.delayedMonitorCount} active monitor${input.delayedMonitorCount === 1 ? " is" : "s are"} more than one interval behind schedule.`,
    });
  }

  if (input.failedDeliveryCount > 0) {
    alarms.push({
      id: "delivery-failures",
      severity: "warning",
      title: "Notification deliveries failed",
      detail: `${input.failedDeliveryCount} notification${input.failedDeliveryCount === 1 ? "" : "s"} failed during the last 24 hours.`,
    });
  }

  if (input.queuedDeliveryCount > 0) {
    alarms.push({
      id: "delivery-queued",
      severity: "info",
      title: "Notification deliveries are queued",
      detail: `${input.queuedDeliveryCount} notification${input.queuedDeliveryCount === 1 ? " is" : "s are"} pending or retrying.`,
    });
  }

  return alarms;
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 60_000) {
    return `${Math.ceil(milliseconds / 1_000)} seconds`;
  }

  return `${Math.ceil(milliseconds / 60_000)} minutes`;
}
