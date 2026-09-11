import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitors } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { isMonitorCheckStale } from "@/lib/monitors/health";
import { getWorkerState } from "@/lib/monitors/service";
import { getMonitorTargetDisplay } from "@/lib/monitors/targets";
import { intervalToMs } from "@/lib/monitors/utils";
import { isPidAlive } from "@/lib/worker/process";
import { sanitizeWorkerStatusMessage } from "@/lib/worker/status-message";
import { getHeartbeatAgeMs, isHeartbeatCurrent } from "@/lib/worker/heartbeat";

const DELAYED_MONITOR_LIMIT = 12;

export interface SystemHealthAlarm {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
}

export async function getSystemHealth() {
  const now = new Date();
  const worker = await getWorkerState();

  const monitorRows = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.isActive, true), isNull(monitors.deletedAt)));

  const allDelayedMonitors = monitorRows
    .map((monitor) => toDelayedMonitor(monitor, now))
    .filter((monitor): monitor is NonNullable<typeof monitor> => monitor !== null)
    .sort((left, right) => right.delayMs - left.delayMs);
  const delayedMonitors = allDelayedMonitors.slice(0, DELAYED_MONITOR_LIMIT);
  const staleThresholdMs = Math.max(env.workerPollIntervalMs * 6, 180_000);
  const heartbeatAgeMs = getHeartbeatAgeMs(worker.heartbeatAt, now);
  const heartbeatCurrent = isHeartbeatCurrent(worker.heartbeatAt, now, staleThresholdMs);
  const processAlive = env.disableEmbeddedWorkerSpawn
    ? heartbeatCurrent
    : isPidAlive(worker.pid);
  const workerHealthy =
    worker.desiredState !== "running" ||
    (worker.running && processAlive && heartbeatCurrent);
  const connectivityOffline =
    worker.desiredState === "running" && worker.connectivityStatus === "offline";
  const alarms = buildSystemHealthAlarms({
    workerDesiredState: worker.desiredState,
    workerHealthy,
    heartbeatAgeMs,
    connectivityStatus: worker.connectivityStatus,
    connectivityMessage: worker.connectivityMessage,
    delayedMonitorCount: allDelayedMonitors.length,
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
      lastErrorMessage: sanitizeWorkerStatusMessage(worker.lastErrorMessage),
      connectivityStatus: worker.connectivityStatus,
      connectivityCheckedAt: worker.connectivityCheckedAt?.toISOString() ?? null,
      connectivityMessage: worker.connectivityMessage,
    },
    queue: {
      dueBacklog: monitorRows.filter((monitor) => isMonitorDue(monitor, now)).length,
      delayedMonitorCount: connectivityOffline ? 0 : allDelayedMonitors.length,
      delayedMonitors: connectivityOffline ? [] : delayedMonitors,
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
  if (!isSystemMonitorDelayed(monitor, now)) {
    return null;
  }

  const intervalMs = intervalToMs(monitor.intervalValue, monitor.intervalUnit);
  const dueAt = monitor.nextCheckAt
    ?? (monitor.lastCheckedAt
      ? new Date(monitor.lastCheckedAt.getTime() + intervalMs)
      : monitor.createdAt);
  const delayMs = now.getTime() - dueAt.getTime();

  return {
    id: monitor.id,
    name: monitor.name,
    target: getMonitorTargetDisplay(monitor),
    dueAt: dueAt.toISOString(),
    delayMs,
    verificationMode: monitor.verificationMode,
  };
}

export function isSystemMonitorDelayed(
  monitor: Pick<
    typeof monitors.$inferSelect,
    "lastCheckedAt" | "nextCheckAt" | "intervalValue" | "intervalUnit" | "timeout"
  >,
  now: Date
) {
  return isMonitorCheckStale({
    lastCheckedAt: monitor.lastCheckedAt,
    nextCheckAt: monitor.nextCheckAt,
    intervalValue: monitor.intervalValue,
    intervalUnit: monitor.intervalUnit,
    timeout: monitor.timeout,
    now,
  });
}

export function buildSystemHealthAlarms(input: {
  workerDesiredState: string;
  workerHealthy: boolean;
  heartbeatAgeMs: number | null;
  connectivityStatus: string;
  connectivityMessage: string | null;
  delayedMonitorCount: number;
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

  const connectivityOffline =
    input.workerDesiredState === "running" && input.connectivityStatus === "offline";

  if (connectivityOffline) {
    alarms.push({
      id: "worker-connectivity-offline",
      severity: "critical",
      title: "Internet connectivity is unavailable",
      detail: input.connectivityMessage
        ?? "Monitor checks, webhook retries, and scheduled reports are paused without changing monitor states.",
    });
  }

  if (input.delayedMonitorCount > 0 && !connectivityOffline) {
    alarms.push({
      id: "checks-delayed",
      severity: input.delayedMonitorCount >= 10 ? "critical" : "warning",
      title: "Monitor checks are delayed",
      detail: `${input.delayedMonitorCount} active monitor${input.delayedMonitorCount === 1 ? " is" : "s are"} more than one interval behind schedule.`,
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
