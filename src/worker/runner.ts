import "@/worker/load-env";
import { env } from "@/lib/env";
import { getWorkerState, updateWorkerState } from "@/lib/monitors/service";
import { runWorkerPhases } from "@/worker/phases";
import {
  getActiveMonitorCheckCount,
  resumeMonitorDispatch,
  setMonitorDispatchGuard,
  stopMonitorDispatch,
} from "@/worker/scheduler";
import { shouldAutoStartWorker } from "@/worker/startup";
import { sanitizeWorkerStatusMessage } from "@/lib/worker/status-message";
import { acquireWorkerProcessLock } from "@/lib/worker/process-lock";

let active = true;
const shutdownWaiters = new Set<() => void>();
const HEARTBEAT_INTERVAL_MS = Math.min(30_000, Math.max(1_000, env.workerPollIntervalMs));

async function main() {
  const releaseProcessLock = await acquireWorkerProcessLock();
  if (!releaseProcessLock) {
    console.error("[sentrovia] Another worker process is already running.");
    return;
  }

  try {
    await runWorkerLoop();
  } finally {
    // Even when the loop fails, checks still running finish before another worker may take over.
    await stopMonitorDispatch().catch((error) => {
      console.error("[sentrovia] Unable to finish running monitor checks before shutdown.", error);
    });
    await releaseProcessLock();
  }
}

async function runWorkerLoop() {
  void runHeartbeatLoop();
  // Freed check slots are refilled between loop iterations; this keeps those refills paused too.
  setMonitorDispatchGuard(isRunRequested);
  const currentState = await getWorkerState();
  const shouldAutoStart = shouldAutoStartWorker(
    currentState,
    env.workerAutoStart
  );

  await updateWorkerState({
    desiredState: shouldAutoStart ? "running" : currentState.desiredState,
    running: false,
    pid: process.pid,
    heartbeatAt: new Date(),
    statusMessage: shouldAutoStart
      ? "Worker booted and auto-start is enabled."
      : "Worker booted and waiting for a start command.",
  });

  while (active) {
    const state = await getWorkerState();

    if (state.desiredState === "running") {
      resumeMonitorDispatch();
      if (!state.running) {
        await updateWorkerState({
          running: true,
          startedAt: state.startedAt ?? new Date(),
          stoppedAt: null,
          pid: process.pid,
          statusMessage: "Worker is running monitor checks.",
        });
      }

      try {
        await updateWorkerState({
          running: true,
          heartbeatAt: new Date(),
          pid: process.pid,
          statusMessage: "Worker is processing the current monitoring batch.",
        });
        const phaseResult = await runWorkerPhases(isRunRequested);
        if (phaseResult.status === "completed") {
          const activeChecks = getActiveMonitorCheckCount();
          await updateWorkerState({
            running: true,
            heartbeatAt: new Date(),
            lastCycleAt: new Date(),
            pid: process.pid,
            statusMessage: activeChecks > 0
              ? `Worker is running ${activeChecks} monitor check(s).`
              : "Worker is healthy and waiting for the next due monitor.",
          });
        } else if (phaseResult.status === "connectivity-paused") {
          await updateWorkerState({
            running: true,
            heartbeatAt: new Date(),
            pid: process.pid,
            statusMessage: phaseResult.message,
          });
        } else {
          await stopMonitorDispatch();
          await markWorkerStopped();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Worker cycle failed.";
        console.error("[sentrovia] Worker cycle failed.", error);
        await updateWorkerState({
          running: true,
          heartbeatAt: new Date(),
          lastErrorAt: new Date(),
          lastErrorMessage: message,
          statusMessage: sanitizeWorkerStatusMessage(message),
        });
      }
    } else if (state.running) {
      await stopMonitorDispatch();
      await markWorkerStopped();
    } else {
      await updateWorkerState({
        running: false,
        heartbeatAt: new Date(),
        pid: process.pid,
        statusMessage: "Worker is idle and waiting for a start command.",
      });
    }

    await sleep(env.workerPollIntervalMs);
  }

  // Checks already running finish and release their leases before the process lock is released.
  await stopMonitorDispatch();
  await updateWorkerState({
    running: false,
    stoppedAt: new Date(),
    heartbeatAt: new Date(),
    statusMessage: "Worker shut down gracefully.",
  });
}

async function isRunRequested() {
  if (!active) return false;
  const state = await getWorkerState();
  return state.desiredState === "running";
}

async function markWorkerStopped() {
  await updateWorkerState({
    running: false,
    stoppedAt: new Date(),
    heartbeatAt: new Date(),
    pid: process.pid,
    statusMessage: "Worker is paused.",
  });
}

async function runHeartbeatLoop() {
  while (active) {
    await sleep(HEARTBEAT_INTERVAL_MS);
    if (!active) return;

    try {
      await updateWorkerState({ heartbeatAt: new Date(), pid: process.pid });
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Worker heartbeat update failed.");
    }
  }
}

function sleep(ms: number) {
  if (!active) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      shutdownWaiters.delete(finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    shutdownWaiters.add(finish);
  });
}

function shutdown() {
  if (!active) {
    return;
  }

  active = false;
  for (const wake of [...shutdownWaiters]) {
    wake();
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

void main().catch(async (error) => {
  shutdown();
  const message = error instanceof Error ? error.message : "Worker crashed.";
  console.error(message);
  try {
    await updateWorkerState({
      running: false,
      stoppedAt: new Date(),
      heartbeatAt: new Date(),
      statusMessage: sanitizeWorkerStatusMessage(message),
    });
  } catch (stateError) {
    console.error(stateError instanceof Error ? stateError.message : "Unable to persist the worker crash state.");
  }
  process.exitCode = 1;
});
