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

// Monitors run in independent slots instead of rounds: a round used to wait for its slowest monitor
// (a timeout or verification probe can take minutes), holding back every other monitor's next check.
// Now a freed slot is refilled from the due queue right away, so one slow site delays nothing else.
const MONITOR_REFILL_DELAY_MS = 250;
// A check renews its lease this often while it runs, so a check that outlasts its precomputed lease
// budget (slow database, slow delivery) is never taken over and run twice. Well below the shortest
// lease of three minutes.
const MONITOR_LEASE_HEARTBEAT_MS = 60_000;
// Metric columns are 32-bit integers; a worker stopped for weeks would otherwise overflow them.
const MAX_RECORDED_SCHEDULE_LAG_MS = 2_147_483_647;

type DispatchSource = "tick" | "refill";

export type MonitorDispatch = {
  claimed: number;
  // Settles when every monitor claimed by this dispatch is done and its metrics are recorded.
  completion: Promise<void>;
};

type MonitorDispatcherOptions = {
  concurrency: number;
  refillDelayMs?: number;
  leaseHeartbeatMs?: number;
};

export function createMonitorDispatcher({
  concurrency,
  refillDelayMs = MONITOR_REFILL_DELAY_MS,
  leaseHeartbeatMs = MONITOR_LEASE_HEARTBEAT_MS,
}: MonitorDispatcherOptions) {
  const slotCount = Math.max(1, concurrency);
  // Verification probes run with up to twice the monitor timeout. Capping them at half the slots keeps
  // room for regular checks when many sites fail at once.
  const verificationSlotCount = Math.max(1, Math.floor(slotCount / 2));
  // Each claim queries every due workspace, so freed slots are refilled in groups rather than one by
  // one; slots below the group size are picked up by the next regular dispatch.
  const refillGroupSize = Math.max(1, Math.floor(slotCount / 4));
  const pendingCompletions = new Set<Promise<void>>();
  let activeChecks = 0;
  let activeVerificationChecks = 0;
  let claimQueue: Promise<unknown> = Promise.resolve();
  let refillTimer: ReturnType<typeof setTimeout> | null = null;
  let moreMayBeDue = false;
  let stopped = false;
  let canDispatch: () => Promise<boolean> = async () => true;

  function dispatch(source: DispatchSource = "tick"): Promise<MonitorDispatch> {
    // Claims run one at a time so two dispatches never count the same free slot.
    const next = claimQueue.then(() => claimAndStart(source));
    claimQueue = next.catch(() => undefined);
    return next;
  }

  async function claimAndStart(source: DispatchSource): Promise<MonitorDispatch> {
    if (stopped || (source === "refill" && !(await canDispatch()))) {
      return { claimed: 0, completion: Promise.resolve() };
    }

    const startedAt = new Date();
    const freeSlots = slotCount - activeChecks;
    if (freeSlots <= 0) {
      moreMayBeDue = true;
      if (source === "tick") {
        await updateWorkerState({
          heartbeatAt: startedAt,
          statusMessage: `All ${slotCount} check slots are busy; due monitors start as slots free up.`,
        });
      }
      return { claimed: 0, completion: Promise.resolve() };
    }

    const backlogAtStart = await countDueMonitors(startedAt);
    const claimed = await claimDueMonitors(startedAt, {
      limit: freeSlots,
      verificationLimit: Math.max(0, verificationSlotCount - activeVerificationChecks),
    });
    moreMayBeDue = claimed.length >= freeSlots || backlogAtStart > claimed.length;
    if (claimed.length === 0 && source === "refill") {
      return { claimed: 0, completion: Promise.resolve() };
    }

    // Start the claimed monitors first: they hold leases, so nothing may stand between claim and start.
    const completion = runClaimedMonitors(claimed, startedAt, backlogAtStart);
    const tracked = completion.catch((error) => {
      console.error("[sentrovia] Unable to record a finished monitor batch.", error);
    });
    pendingCompletions.add(tracked);
    void tracked.finally(() => pendingCompletions.delete(tracked));

    await updateWorkerState({
      lastCycleAt: startedAt,
      heartbeatAt: startedAt,
      statusMessage: claimed.length > 0 ? `Processing ${claimed.length} monitor(s).` : "Idle cycle completed.",
    }).catch((error) => {
      console.error("[sentrovia] Unable to record the monitor dispatch.", error);
    });
    return { claimed: claimed.length, completion };
  }

  async function runClaimedMonitors(claimed: ClaimedMonitor[], startedAt: Date, backlogAtStart: number) {
    const results: MonitorCycleResult[] = [];
    const errors: string[] = [];
    const scheduleLags = claimed
      .map((monitor) => calculateScheduleLagMs(monitor, startedAt))
      .filter((lag): lag is number => lag !== null);

    await Promise.all(claimed.map(async (monitor) => {
      activeChecks += 1;
      if (monitor.verificationMode) activeVerificationChecks += 1;
      // A check that ends without a result (e.g. the worker is offline) leaves its monitor due again.
      // Refilling from it would claim the same monitors in a tight loop; the next regular dispatch
      // picks them up instead.
      let madeProgress = false;
      try {
        const result = await processMonitor(monitor, leaseHeartbeatMs);
        if (result) {
          results.push(result);
          madeProgress = true;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "A monitor check failed unexpectedly.";
        errors.push(message);
        await updateWorkerState({
          heartbeatAt: new Date(),
          statusMessage: message,
          lastErrorAt: new Date(),
          lastErrorMessage: message,
        }).catch((stateError) => {
          console.error("[sentrovia] Unable to record a monitor check failure.", stateError);
        });
      } finally {
        activeChecks -= 1;
        if (monitor.verificationMode) activeVerificationChecks -= 1;
        if (madeProgress) scheduleRefill();
      }
    }));

    await recordFinishedBatch(claimed.length, results, errors, startedAt, backlogAtStart, scheduleLags);
  }

  function scheduleRefill() {
    if (stopped || !moreMayBeDue || refillTimer || slotCount - activeChecks < refillGroupSize) return;
    // A short delay lets several finishing checks share one claim query.
    refillTimer = setTimeout(() => {
      refillTimer = null;
      void dispatch("refill").catch((error) => {
        console.error("[sentrovia] Unable to start due monitors.", error);
      });
    }, refillDelayMs);
    refillTimer.unref?.();
  }

  return {
    dispatch,
    setDispatchGuard(guard: () => Promise<boolean>) {
      canDispatch = guard;
    },
    stop() {
      stopped = true;
      if (refillTimer) {
        clearTimeout(refillTimer);
        refillTimer = null;
      }
    },
    resume() {
      stopped = false;
    },
    // Resolves once every started monitor has finished and been recorded.
    async drain() {
      await claimQueue;
      while (pendingCompletions.size > 0) {
        await Promise.all([...pendingCompletions]);
      }
    },
    getActiveCheckCount() {
      return activeChecks;
    },
  };
}

// How long a monitor had been due when its check started; the core health signal of a scheduler.
export function calculateScheduleLagMs(monitor: Pick<ClaimedMonitor, "nextCheckAt">, startedAt: Date) {
  if (!monitor.nextCheckAt) return null;
  return Math.min(MAX_RECORDED_SCHEDULE_LAG_MS, Math.max(0, startedAt.getTime() - monitor.nextCheckAt.getTime()));
}

async function recordFinishedBatch(
  claimedCount: number,
  results: MonitorCycleResult[],
  errors: string[],
  startedAt: Date,
  backlogAtStart: number,
  scheduleLags: number[]
) {
  const finishedAt = new Date();
  const latencyValues = results
    .map((item) => item.latencyMs)
    .filter((item): item is number => typeof item === "number");
  const successCount = results.filter((item) => item.finalStatus === "up").length;
  const failureCount = results.filter((item) => item.finalStatus === "down").length;
  const pendingCount = results.filter((item) => item.finalStatus === "pending").length;
  const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
  const averageLatencyMs =
    latencyValues.length > 0
      ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length)
      : null;
  const maxLatencyMs = latencyValues.length > 0 ? Math.max(...latencyValues) : null;

  await recordWorkerCycleMetric({
    cycleStartedAt: startedAt,
    cycleFinishedAt: finishedAt,
    durationMs,
    backlogAtStart,
    claimedMonitors: claimedCount,
    completedMonitors: results.length,
    successCount,
    failureCount,
    pendingCount,
    averageLatencyMs,
    maxLatencyMs,
    averageScheduleLagMs: scheduleLags.length > 0
      ? Math.round(scheduleLags.reduce((sum, value) => sum + value, 0) / scheduleLags.length)
      : null,
    maxScheduleLagMs: scheduleLags.length > 0 ? Math.max(...scheduleLags) : null,
    errorMessage: errors[0] ?? null,
  });

  await updateWorkerState({
    heartbeatAt: finishedAt,
    lastCycleAt: finishedAt,
    lastCycleDurationMs: durationMs,
    lastCycleMonitorCount: claimedCount,
    lastCycleSuccessCount: successCount,
    lastCycleFailureCount: failureCount,
    lastCyclePendingCount: pendingCount,
    lastCycleAverageLatencyMs: averageLatencyMs,
    lastCycleBacklog: backlogAtStart,
    // Batches overlap, so a clean batch must not wipe an error another batch or phase just recorded.
    ...(errors[0] ? { lastErrorAt: finishedAt, lastErrorMessage: errors[0] } : {}),
    statusMessage: buildCycleStatusMessage(claimedCount, results.length, errors.length),
  });
}

const monitorDispatcher = createMonitorDispatcher({ concurrency: env.workerConcurrency });

// Claims due monitors for the free slots and starts them without waiting for them to finish.
export function dispatchDueMonitors() {
  return monitorDispatcher.dispatch("tick");
}

// Claims due monitors and waits until those monitors are checked and recorded.
export async function runMonitoringCycle() {
  const dispatch = await dispatchDueMonitors();
  await dispatch.completion;
  return dispatch.claimed;
}

export function setMonitorDispatchGuard(guard: () => Promise<boolean>) {
  monitorDispatcher.setDispatchGuard(guard);
}

export function resumeMonitorDispatch() {
  monitorDispatcher.resume();
}

// Stops starting new monitors and waits for the running ones to finish.
export async function stopMonitorDispatch() {
  monitorDispatcher.stop();
  await monitorDispatcher.drain();
}

export function getActiveMonitorCheckCount() {
  return monitorDispatcher.getActiveCheckCount();
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

async function processMonitor(monitor: ClaimedMonitor, leaseHeartbeatMs: number): Promise<MonitorCycleResult | null> {
  let processingError: unknown;
  let heartbeat: ReturnType<typeof startLeaseHeartbeat> | null = null;

  try {
    const leaseRenewed = await renewMonitorLease(monitor.id, monitor.leaseToken, monitor);
    if (!leaseRenewed) {
      return null;
    }

    heartbeat = startLeaseHeartbeat(monitor, leaseHeartbeatMs);
    return await processClaimedMonitor(monitor);
  } catch (error) {
    processingError = error;
    throw error;
  } finally {
    // Stop renewing (and let an in-flight renewal settle) before the lease is released.
    await heartbeat?.stop();
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

function startLeaseHeartbeat(monitor: ClaimedMonitor, intervalMs: number) {
  let renewal: Promise<unknown> | null = null;
  const timer = setInterval(() => {
    if (renewal) return;
    // A refused renewal means the monitor was paused, reset or deleted; the check's own lease
    // checks then skip its side effects, so there is nothing else to do here.
    renewal = renewMonitorLease(monitor.id, monitor.leaseToken, monitor, { heartbeat: true })
      .catch((error) => {
        console.error(`[sentrovia] Unable to renew the monitor lease for ${monitor.id}.`, error);
      })
      .finally(() => {
        renewal = null;
      });
  }, intervalMs);
  timer.unref?.();

  return {
    async stop() {
      clearInterval(timer);
      await renewal;
    },
  };
}
