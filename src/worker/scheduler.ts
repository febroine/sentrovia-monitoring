import { env } from "@/lib/env";
import { openOrUpdateIncident, resolveIncident } from "@/lib/incidents/service";
import { analyzeRootCause } from "@/lib/monitoring/rca";
import {
  appendMonitorCheck,
  appendMonitorEvent,
  incrementWorkerCheckedCount,
  countDueMonitors,
  claimDueMonitors,
  recordMonitorResult,
  updateWorkerState,
} from "@/lib/monitors/service";
import type { Monitor } from "@/lib/db/schema";
import { recordWorkerCycleMetric } from "@/lib/worker/observability";
import { calculateNextCheckAt, calculateVerificationCheckAt, checkMonitor } from "@/worker/checker";
import { sendMonitorNotifications } from "@/worker/notifier";

export async function runMonitoringCycle() {
  const cycleStartedAt = new Date();
  const backlogAtStart = await countDueMonitors(cycleStartedAt);
  const dueMonitors = await claimDueMonitors(cycleStartedAt);
  const cycleResults: Array<{ finalStatus: "up" | "down" | "pending"; latencyMs: number | null }> = [];
  const cycleErrors: string[] = [];

  await updateWorkerState({
    lastCycleAt: cycleStartedAt,
    heartbeatAt: cycleStartedAt,
    statusMessage: dueMonitors.length > 0 ? `Processing ${dueMonitors.length} monitor(s).` : "Idle cycle completed.",
  });

  await runWithConcurrency(dueMonitors, env.workerConcurrency, async (monitor) => {
    try {
      cycleResults.push(await processMonitor(monitor));
    } catch (error) {
      cycleErrors.push(error instanceof Error ? error.message : "A monitor check failed unexpectedly.");
      await updateWorkerState({
        heartbeatAt: new Date(),
        statusMessage: error instanceof Error ? error.message : "A monitor check failed unexpectedly.",
        lastErrorAt: new Date(),
        lastErrorMessage: error instanceof Error ? error.message : "A monitor check failed unexpectedly.",
      });
    }
  });

  const cycleFinishedAt = new Date();
  const latencyValues = cycleResults
    .map((item) => item.latencyMs)
    .filter((item): item is number => typeof item === "number");
  const successCount = cycleResults.filter((item) => item.finalStatus === "up").length;
  const failureCount = cycleResults.filter((item) => item.finalStatus === "down").length;
  const pendingCount = cycleResults.filter((item) => item.finalStatus === "pending").length;
  const durationMs = Math.max(0, cycleFinishedAt.getTime() - cycleStartedAt.getTime());
  const averageLatencyMs =
    latencyValues.length > 0
      ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length)
      : null;
  const maxLatencyMs = latencyValues.length > 0 ? Math.max(...latencyValues) : null;

  await recordWorkerCycleMetric({
    cycleStartedAt,
    cycleFinishedAt,
    durationMs,
    backlogAtStart,
    claimedMonitors: dueMonitors.length,
    completedMonitors: cycleResults.length,
    successCount,
    failureCount,
    pendingCount,
    averageLatencyMs,
    maxLatencyMs,
    errorMessage: cycleErrors[0] ?? null,
  });

  await updateWorkerState({
    heartbeatAt: cycleFinishedAt,
    lastCycleAt: cycleFinishedAt,
    lastCycleDurationMs: durationMs,
    lastCycleMonitorCount: dueMonitors.length,
    lastCycleSuccessCount: successCount,
    lastCycleFailureCount: failureCount,
    lastCyclePendingCount: pendingCount,
    lastCycleAverageLatencyMs: averageLatencyMs,
    lastCycleBacklog: backlogAtStart,
    lastErrorAt: cycleErrors[0] ? cycleFinishedAt : null,
    lastErrorMessage: cycleErrors[0] ?? null,
    statusMessage:
      dueMonitors.length > 0
        ? `Completed ${dueMonitors.length} monitor check(s).`
        : "Worker is healthy and waiting for the next due monitor.",
  });

  return dueMonitors.length;
}

async function processMonitor(monitor: Monitor) {
  const result = await checkMonitor(monitor);
  const rca = analyzeRootCause(result);
  const threshold = Math.max(1, monitor.retries);
  const previousStatus = monitor.status;
  const previousStatusCode = monitor.statusCode;
  const hadConfirmedIncident = previousStatus === "down" && !monitor.verificationMode;
  const wasVerifying = monitor.verificationMode;
  let incidentConfirmedThisCycle = false;
  let failureEventMessage: string | null = null;
  let checkStatus: "up" | "down" | "pending" = result.ok ? "up" : "pending";

  if (result.ok) {
    await recordMonitorResult(monitor.id, {
      status: "up",
      statusCode: result.statusCode,
      uptime: "100%",
      lastCheckedAt: result.checkedAt,
      nextCheckAt: calculateNextCheckAt(monitor, result.checkedAt),
      lastSuccessAt: result.checkedAt,
      lastFailureAt: monitor.lastFailureAt,
      sslExpiresAt: result.sslExpiresAt,
      lastErrorMessage: null,
      consecutiveFailures: 0,
      verificationMode: false,
      verificationFailureCount: 0,
      latencyMs: result.latencyMs,
    });
  } else if (hadConfirmedIncident) {
    checkStatus = "down";
    failureEventMessage = result.errorMessage ?? "Health check failed.";
    await recordMonitorResult(monitor.id, {
      status: "down",
      statusCode: result.statusCode,
      uptime: "0%",
      lastCheckedAt: result.checkedAt,
      nextCheckAt: calculateNextCheckAt(monitor, result.checkedAt),
      lastSuccessAt: monitor.lastSuccessAt,
      lastFailureAt: monitor.lastFailureAt ?? result.checkedAt,
      sslExpiresAt: result.sslExpiresAt,
      lastErrorMessage: result.errorMessage,
      consecutiveFailures: monitor.consecutiveFailures + 1,
      verificationMode: false,
      verificationFailureCount: 0,
      latencyMs: result.latencyMs,
    });
  } else if (wasVerifying || threshold === 1) {
    const verificationCount = wasVerifying ? monitor.verificationFailureCount + 1 : 1;
    const confirmedIncident = verificationCount >= threshold;
    incidentConfirmedThisCycle = confirmedIncident;
    checkStatus = confirmedIncident ? "down" : "pending";
    failureEventMessage = confirmedIncident ? result.errorMessage ?? "Health check failed." : null;

    await recordMonitorResult(monitor.id, {
      status: confirmedIncident ? "down" : "pending",
      statusCode: result.statusCode,
      uptime: confirmedIncident ? "0%" : monitor.uptime,
      lastCheckedAt: result.checkedAt,
      nextCheckAt: confirmedIncident
        ? calculateNextCheckAt(monitor, result.checkedAt)
        : calculateVerificationCheckAt(result.checkedAt),
      lastSuccessAt: monitor.lastSuccessAt,
      lastFailureAt: previousStatus === "up" ? result.checkedAt : monitor.lastFailureAt ?? result.checkedAt,
      sslExpiresAt: result.sslExpiresAt,
      lastErrorMessage: result.errorMessage,
      consecutiveFailures: verificationCount,
      verificationMode: !confirmedIncident,
      verificationFailureCount: confirmedIncident ? 0 : verificationCount,
      latencyMs: result.latencyMs,
    });

    if (!confirmedIncident) {
      await appendDetailedEvent(
        monitor,
        result,
        "verification",
        `Verification attempt ${verificationCount} of ${threshold} failed. Outage is pending confirmation.`,
        rca,
        "pending"
      );
    }
  } else {
    checkStatus = "pending";
    await recordMonitorResult(monitor.id, {
      status: "pending",
      statusCode: result.statusCode,
      uptime: monitor.uptime,
      lastCheckedAt: result.checkedAt,
      nextCheckAt: calculateVerificationCheckAt(result.checkedAt),
      lastSuccessAt: monitor.lastSuccessAt,
      lastFailureAt: previousStatus === "up" ? result.checkedAt : monitor.lastFailureAt ?? result.checkedAt,
      sslExpiresAt: result.sslExpiresAt,
      lastErrorMessage: result.errorMessage,
      consecutiveFailures: 1,
      verificationMode: true,
      verificationFailureCount: 1,
      latencyMs: result.latencyMs,
    });

    await appendDetailedEvent(
      monitor,
      result,
      "verification",
      `Verification mode started. Attempt 1 of ${threshold} failed.`,
      rca,
      "pending"
    );
  }

  await updateWorkerState({
    heartbeatAt: new Date(),
  });
  await incrementWorkerCheckedCount();
  await appendMonitorCheck({
    monitorId: monitor.id,
    userId: monitor.userId,
    status: checkStatus,
    statusCode: result.statusCode,
    latencyMs: result.latencyMs,
    createdAt: result.checkedAt,
  });

  if (result.ok) {
    await appendCheckEvent(monitor, result, rca);
  }

  if (!result.ok && failureEventMessage) {
    await appendDetailedEvent(monitor, result, "failure", failureEventMessage, rca, checkStatus);
    await openOrUpdateIncident({
      monitorId: monitor.id,
      userId: monitor.userId,
      checkedAt: result.checkedAt,
      statusCode: result.statusCode,
      errorMessage: failureEventMessage,
    });

    if (incidentConfirmedThisCycle) {
      await sendMonitorNotifications({ kind: "failure", message: failureEventMessage, monitor, result, rca });
    }
  }

  if (!result.ok && checkStatus === "down" && !incidentConfirmedThisCycle) {
    const reminderMessage = buildDowntimeReminderMessage(monitor, result.checkedAt);
    if (reminderMessage) {
      const reminderSent = await sendMonitorNotifications({
        kind: "downtime-reminder",
        message: reminderMessage,
        monitor,
        result,
        rca,
      });

      if (reminderSent) {
        await appendDetailedEvent(monitor, result, "downtime-reminder", reminderMessage, rca, "down");
      }
    }
  }

  if (result.ok && hadConfirmedIncident) {
    const message = "Service recovered and is responding again.";
    await appendDetailedEvent(monitor, result, "recovery", message, rca, "up");
    await resolveIncident({
      monitorId: monitor.id,
      userId: monitor.userId,
      checkedAt: result.checkedAt,
      statusCode: result.statusCode,
    });
    await sendMonitorNotifications({ kind: "recovery", message, monitor, result, rca });
  }

  if (
    checkStatus !== "pending" &&
    !monitor.verificationMode &&
    previousStatusCode !== null &&
    result.statusCode !== null &&
    previousStatusCode !== result.statusCode
  ) {
    const message = `Status code changed from ${previousStatusCode} to ${result.statusCode}.`;
    await appendDetailedEvent(monitor, result, "status-change", message, rca, checkStatus);
    await sendMonitorNotifications({ kind: "status-change", message, monitor, result, rca });
  }

  return {
    finalStatus: checkStatus,
    latencyMs: result.latencyMs,
  };
}

function buildDowntimeReminderMessage(monitor: Monitor, checkedAt: Date) {
  if (!monitor.lastFailureAt) {
    return null;
  }

  const downtimeStartedAt = new Date(monitor.lastFailureAt);
  if (Number.isNaN(downtimeStartedAt.getTime())) {
    return null;
  }

  const durationMinutes = Math.max(0, Math.floor((checkedAt.getTime() - downtimeStartedAt.getTime()) / 60_000));
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (hours > 0) {
    return `Service has been down for ${hours}h ${minutes}m.`;
  }

  return `Service has been down for ${durationMinutes}m.`;
}

async function appendCheckEvent(
  monitor: Monitor,
  result: Awaited<ReturnType<typeof checkMonitor>>,
  rca: ReturnType<typeof analyzeRootCause>
) {
  const message = `Check completed successfully in ${result.latencyMs ?? "n/a"}ms.`;
  await appendMonitorEvent({
    monitorId: monitor.id,
    userId: monitor.userId,
    eventType: "check",
    status: result.status,
    statusCode: result.statusCode,
    latencyMs: result.latencyMs,
    message,
    rcaType: rca.type,
    rcaTitle: rca.title,
    rcaSummary: rca.summary,
  });
}

async function appendDetailedEvent(
  monitor: Monitor,
  result: Awaited<ReturnType<typeof checkMonitor>>,
  eventType: string,
  message: string,
  rca: ReturnType<typeof analyzeRootCause>,
  status: "up" | "down" | "pending"
) {
  await appendMonitorEvent({
    monitorId: monitor.id,
    userId: monitor.userId,
    eventType,
    status,
    statusCode: result.statusCode,
    latencyMs: result.latencyMs,
    message,
    rcaType: rca.type,
    rcaTitle: rca.title,
    rcaSummary: rca.summary,
  });
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
) {
  const queue = [...items];
  const concurrency = Math.max(1, limit);

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length || 1) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) {
          return;
        }

        await worker(item);
      }
    })
  );
}
