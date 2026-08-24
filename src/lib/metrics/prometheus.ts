import crypto from "node:crypto";
import { and, count, desc, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  automaticBackupRuns,
  deliveryEvents,
  monitors,
  workerState,
} from "@/lib/db/schema";
import { env, getMetricsAuthToken } from "@/lib/env";
import { WORKER_STATE_ID } from "@/lib/worker/constants";

const MONITOR_STATUSES = ["up", "down", "pending"] as const;
const DELIVERY_STATUSES = ["pending", "retrying", "processing", "delivered", "failed"] as const;
const BACKUP_STATUSES = ["completed", "failed", "running", "none"] as const;

export type PrometheusSnapshot = {
  workerUp: number;
  workerDesiredRunning: number;
  workerHeartbeatAgeSeconds: number;
  lastCycleDurationSeconds: number;
  lastCycleBacklog: number;
  lastCycleMonitorCount: number;
  activeMonitors: number;
  dueMonitors: number;
  monitorsByStatus: Record<(typeof MONITOR_STATUSES)[number], number>;
  deliveriesByStatus: Record<(typeof DELIVERY_STATUSES)[number], number>;
  backupStatus: (typeof BACKUP_STATUSES)[number];
  lastBackupSuccessTimestampSeconds: number;
};

export function isMetricsRequestAuthorized(authorizationHeader: string | null) {
  const configuredToken = getMetricsAuthToken();
  if (!configuredToken) return false;
  const suppliedToken = authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  const expected = crypto.createHash("sha256").update(configuredToken).digest();
  const supplied = crypto.createHash("sha256").update(suppliedToken).digest();
  return crypto.timingSafeEqual(expected, supplied);
}

export async function collectPrometheusSnapshot(now = new Date()): Promise<PrometheusSnapshot> {
  const [monitorRows, activeRows, deliveryRows, workerRows, backupRows, successfulBackupRows, dueRows] = await Promise.all([
    db
      .select({
        status: monitors.status,
        total: count(),
      })
      .from(monitors)
      .where(isNull(monitors.deletedAt))
      .groupBy(monitors.status),
    db
      .select({ total: count() })
      .from(monitors)
      .where(and(eq(monitors.isActive, true), isNull(monitors.deletedAt))),
    db
      .select({ status: deliveryEvents.status, total: count() })
      .from(deliveryEvents)
      .groupBy(deliveryEvents.status),
    db.select().from(workerState).where(eq(workerState.id, WORKER_STATE_ID)).limit(1),
    db
      .select({ status: automaticBackupRuns.status, completedAt: automaticBackupRuns.completedAt })
      .from(automaticBackupRuns)
      .orderBy(desc(automaticBackupRuns.startedAt))
      .limit(1),
    db
      .select({ completedAt: automaticBackupRuns.completedAt })
      .from(automaticBackupRuns)
      .where(eq(automaticBackupRuns.status, "completed"))
      .orderBy(desc(automaticBackupRuns.completedAt))
      .limit(1),
    db
      .select({ total: count() })
      .from(monitors)
      .where(and(
        eq(monitors.isActive, true),
        isNull(monitors.deletedAt),
        or(lte(monitors.nextCheckAt, now), isNull(monitors.nextCheckAt)),
        or(lte(monitors.leaseExpiresAt, now), isNull(monitors.leaseExpiresAt))
      )),
  ]);
  const worker = workerRows[0];
  const heartbeatAgeSeconds = worker?.heartbeatAt
    ? Math.max(0, (now.getTime() - worker.heartbeatAt.getTime()) / 1000)
    : 0;
  const staleThresholdSeconds = Math.max(env.workerPollIntervalMs * 6, 180_000) / 1000;
  const backup = backupRows[0];
  const successfulBackup = successfulBackupRows[0];
  const monitorCounts = new Map(monitorRows.map((row) => [row.status, Number(row.total)]));
  const deliveryCounts = new Map(deliveryRows.map((row) => [row.status, Number(row.total)]));

  return {
    workerUp: worker?.running && isWorkerHeartbeatCurrent(worker.heartbeatAt, now, staleThresholdSeconds) ? 1 : 0,
    workerDesiredRunning: worker?.desiredState === "running" ? 1 : 0,
    workerHeartbeatAgeSeconds: heartbeatAgeSeconds,
    lastCycleDurationSeconds: Math.max(0, (worker?.lastCycleDurationMs ?? 0) / 1000),
    lastCycleBacklog: worker?.lastCycleBacklog ?? 0,
    lastCycleMonitorCount: worker?.lastCycleMonitorCount ?? 0,
    activeMonitors: Number(activeRows[0]?.total ?? 0),
    dueMonitors: Number(dueRows[0]?.total ?? 0),
    monitorsByStatus: buildStatusRecord(MONITOR_STATUSES, monitorCounts),
    deliveriesByStatus: buildStatusRecord(DELIVERY_STATUSES, deliveryCounts),
    backupStatus: isBackupStatus(backup?.status) ? backup.status : "none",
    lastBackupSuccessTimestampSeconds: successfulBackup?.completedAt
      ? successfulBackup.completedAt.getTime() / 1000
      : 0,
  };
}

export function isWorkerHeartbeatCurrent(heartbeatAt: Date | null | undefined, now: Date, thresholdSeconds: number) {
  if (!heartbeatAt) return false;
  const ageSeconds = Math.max(0, (now.getTime() - heartbeatAt.getTime()) / 1000);
  return ageSeconds <= thresholdSeconds;
}

export function renderPrometheusMetrics(snapshot: PrometheusSnapshot) {
  const lines = [
    "# HELP sentrovia_worker_up Whether the worker heartbeat is current.",
    "# TYPE sentrovia_worker_up gauge",
    `sentrovia_worker_up ${snapshot.workerUp}`,
    "# HELP sentrovia_worker_desired_running Whether worker state requests monitoring.",
    "# TYPE sentrovia_worker_desired_running gauge",
    `sentrovia_worker_desired_running ${snapshot.workerDesiredRunning}`,
    "# HELP sentrovia_worker_heartbeat_age_seconds Seconds since the latest worker heartbeat.",
    "# TYPE sentrovia_worker_heartbeat_age_seconds gauge",
    `sentrovia_worker_heartbeat_age_seconds ${formatMetricValue(snapshot.workerHeartbeatAgeSeconds)}`,
    "# HELP sentrovia_worker_last_cycle_duration_seconds Duration of the latest monitor cycle.",
    "# TYPE sentrovia_worker_last_cycle_duration_seconds gauge",
    `sentrovia_worker_last_cycle_duration_seconds ${formatMetricValue(snapshot.lastCycleDurationSeconds)}`,
    "# HELP sentrovia_worker_last_cycle_backlog Monitors waiting at the latest cycle start.",
    "# TYPE sentrovia_worker_last_cycle_backlog gauge",
    `sentrovia_worker_last_cycle_backlog ${snapshot.lastCycleBacklog}`,
    "# HELP sentrovia_worker_last_cycle_monitors Monitors processed by the latest cycle.",
    "# TYPE sentrovia_worker_last_cycle_monitors gauge",
    `sentrovia_worker_last_cycle_monitors ${snapshot.lastCycleMonitorCount}`,
    "# HELP sentrovia_monitors_active Active, non-deleted monitors.",
    "# TYPE sentrovia_monitors_active gauge",
    `sentrovia_monitors_active ${snapshot.activeMonitors}`,
    "# HELP sentrovia_monitors_due Monitors currently due for a check.",
    "# TYPE sentrovia_monitors_due gauge",
    `sentrovia_monitors_due ${snapshot.dueMonitors}`,
    "# HELP sentrovia_monitors_by_status Non-deleted monitors by current status.",
    "# TYPE sentrovia_monitors_by_status gauge",
    ...MONITOR_STATUSES.map((status) => `sentrovia_monitors_by_status{status="${status}"} ${snapshot.monitorsByStatus[status]}`),
    "# HELP sentrovia_delivery_events_by_status Retained delivery events by current status.",
    "# TYPE sentrovia_delivery_events_by_status gauge",
    ...DELIVERY_STATUSES.map((status) => `sentrovia_delivery_events_by_status{status="${status}"} ${snapshot.deliveriesByStatus[status]}`),
    "# HELP sentrovia_automatic_backup_status Current state of the latest automatic backup run.",
    "# TYPE sentrovia_automatic_backup_status gauge",
    ...BACKUP_STATUSES.map((status) => `sentrovia_automatic_backup_status{status="${status}"} ${snapshot.backupStatus === status ? 1 : 0}`),
    "# HELP sentrovia_automatic_backup_last_success_timestamp_seconds Completion time of the latest successful automatic backup.",
    "# TYPE sentrovia_automatic_backup_last_success_timestamp_seconds gauge",
    `sentrovia_automatic_backup_last_success_timestamp_seconds ${formatMetricValue(snapshot.lastBackupSuccessTimestampSeconds)}`,
  ];
  return `${lines.join("\n")}\n`;
}

function buildStatusRecord<T extends readonly string[]>(statuses: T, values: Map<string, number>) {
  return Object.fromEntries(statuses.map((status) => [status, values.get(status) ?? 0])) as Record<T[number], number>;
}

function isBackupStatus(value: unknown): value is Exclude<PrometheusSnapshot["backupStatus"], "none"> {
  return value === "completed" || value === "failed" || value === "running";
}

function formatMetricValue(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
}
