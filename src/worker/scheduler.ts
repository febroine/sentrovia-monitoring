import { env } from "@/lib/env";
import { analyzeRootCause } from "@/lib/monitoring/rca";
import {
  appendMonitorCheck,
  appendMonitorEvent,
  incrementWorkerCheckedCount,
  claimDueMonitors,
  recordMonitorResult,
  updateWorkerState,
} from "@/lib/monitors/service";
import type { Monitor } from "@/lib/db/schema";
import { calculateNextCheckAt, calculateVerificationCheckAt, checkMonitor } from "@/worker/checker";
import { sendMonitorNotifications } from "@/worker/notifier";

export async function runMonitoringCycle() {
  const now = new Date();
  const dueMonitors = await claimDueMonitors(now);

  await updateWorkerState({
    lastCycleAt: now,
    heartbeatAt: now,
    statusMessage: dueMonitors.length > 0 ? `Processing ${dueMonitors.length} monitor(s).` : "Idle cycle completed.",
  });

  await runWithConcurrency(dueMonitors, env.workerConcurrency, async (monitor) => {
    try {
      await processMonitor(monitor);
    } catch (error) {
      await updateWorkerState({
        heartbeatAt: new Date(),
        statusMessage: error instanceof Error ? error.message : "A monitor check failed unexpectedly.",
      });
    }
  });

  await updateWorkerState({
    heartbeatAt: new Date(),
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
  const latencyThresholdExceeded = result.latencyMs !== null && result.latencyMs > monitor.timeout * 0.8;
  const sslExpiringSoon =
    monitor.checkSslExpiry &&
    result.sslExpiresAt !== null &&
    result.sslExpiresAt.getTime() - result.checkedAt.getTime() < 1000 * 60 * 60 * 24 * 14;
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
      lastFailureAt: result.checkedAt,
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
      lastFailureAt: result.checkedAt,
      sslExpiresAt: result.sslExpiresAt,
      lastErrorMessage: result.errorMessage,
      consecutiveFailures: monitor.consecutiveFailures + 1,
      verificationMode: false,
      verificationFailureCount: 0,
      latencyMs: result.latencyMs,
    });
  } else {
    checkStatus = "pending";
    await recordMonitorResult(monitor.id, {
      status: "pending",
      statusCode: result.statusCode,
      uptime: monitor.uptime,
      lastCheckedAt: result.checkedAt,
      nextCheckAt: calculateVerificationCheckAt(result.checkedAt),
      lastSuccessAt: monitor.lastSuccessAt,
      lastFailureAt: result.checkedAt,
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
    if (incidentConfirmedThisCycle) {
      await sendMonitorNotifications({ kind: "failure", message: failureEventMessage, monitor, result, rca });
    }
  }

  if (result.ok && hadConfirmedIncident) {
    const message = "Service recovered and is responding again.";
    await appendDetailedEvent(monitor, result, "recovery", message, rca, "up");
    await sendMonitorNotifications({ kind: "recovery", message, monitor, result, rca });
  }

  if (latencyThresholdExceeded) {
    const message = `Latency reached ${result.latencyMs}ms.`;
    await appendDetailedEvent(monitor, result, "latency", message, rca, checkStatus);
    await sendMonitorNotifications({ kind: "latency", message, monitor, result, rca });
  }

  if (
    !monitor.verificationMode &&
    previousStatusCode !== null &&
    result.statusCode !== null &&
    previousStatusCode !== result.statusCode
  ) {
    const message = `Status code changed from ${previousStatusCode} to ${result.statusCode}.`;
    await appendDetailedEvent(monitor, result, "status-change", message, rca, checkStatus);
    await sendMonitorNotifications({ kind: "status-change", message, monitor, result, rca });
  }

  if (sslExpiringSoon) {
    const message = `SSL certificate expires on ${result.sslExpiresAt?.toISOString()}.`;
    await appendDetailedEvent(monitor, result, "ssl-expiry", message, rca, checkStatus);
    await sendMonitorNotifications({ kind: "ssl-expiry", message, monitor, result, rca });
  }
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
