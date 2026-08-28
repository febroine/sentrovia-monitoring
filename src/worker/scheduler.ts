import { env } from "@/lib/env";
import {
  claimDueMonitors,
  countDueMonitors,
  releaseMonitorLease,
  renewMonitorLease,
  updateWorkerState,
  type ClaimedMonitor,
} from "@/lib/monitors/service";
import { recordWorkerCycleMetric } from "@/lib/worker/observability";
import {
  processClaimedMonitor,
  type MonitorCycleResult,
} from "@/worker/monitor-cycle";

export async function runMonitoringCycle() {
  const cycleStartedAt = new Date();
  const backlogAtStart = await countDueMonitors(cycleStartedAt);
  const dueMonitors = await claimDueMonitors(cycleStartedAt);
  const cycleResults: MonitorCycleResult[] = [];
  const cycleErrors: string[] = [];

  await updateWorkerState({
    lastCycleAt: cycleStartedAt,
    heartbeatAt: cycleStartedAt,
    statusMessage: dueMonitors.length > 0 ? `Processing ${dueMonitors.length} monitor(s).` : "Idle cycle completed.",
  });

  await runWithConcurrency(dueMonitors, env.workerConcurrency, async (monitor) => {
    try {
      const result = await processMonitor(monitor);
      if (result) {
        cycleResults.push(result);
      }
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
    statusMessage: buildCycleStatusMessage(dueMonitors.length, cycleResults.length, cycleErrors.length),
  });

  return dueMonitors.length;
}

function buildCycleStatusMessage(claimedCount: number, completedCount: number, errorCount: number) {
  if (claimedCount === 0) {
    return "Worker is healthy and waiting for the next due monitor.";
  }

  if (completedCount === claimedCount && errorCount === 0) {
    return `Completed ${completedCount} monitor check(s).`;
  }

  const errorSuffix = errorCount > 0 ? ` ${errorCount} check(s) failed unexpectedly.` : "";
  return `Completed ${completedCount} of ${claimedCount} monitor check(s).${errorSuffix}`;
}

async function processMonitor(monitor: ClaimedMonitor): Promise<MonitorCycleResult | null> {
  let processingError: unknown;

  try {
    const leaseRenewed = await renewMonitorLease(monitor.id, monitor.leaseToken, monitor);
    if (!leaseRenewed) {
      return null;
    }

    return await processClaimedMonitor(monitor);
  } catch (error) {
    processingError = error;
    throw error;
  } finally {
    try {
      await releaseMonitorLease(monitor.id, monitor.leaseToken);
    } catch (releaseError) {
      if (!processingError) {
        throw releaseError;
      }

      console.error(`Unable to release the monitor lease for ${monitor.id}.`, releaseError);
    }
  }
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

