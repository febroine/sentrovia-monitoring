import { env } from "@/lib/env";
import { retryWebhookQueueForAllUsers } from "@/lib/delivery/service";
import { getWorkerState, updateWorkerState } from "@/lib/monitors/service";
import { runDueReportSchedules } from "@/lib/reports/service";
import { runMonitoringCycle } from "@/worker/scheduler";

let active = true;

async function main() {
  const currentState = await getWorkerState();
  const shouldAutoStart =
    env.workerAutoStart &&
    currentState.desiredState !== "running" &&
    !currentState.running &&
    !currentState.startedAt &&
    (currentState.checkedCount ?? 0) === 0;

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
        await runMonitoringCycle();
        await retryWebhookQueueForAllUsers();
        await runDueReportSchedules();
        await updateWorkerState({
          running: true,
          heartbeatAt: new Date(),
          lastCycleAt: new Date(),
          pid: process.pid,
          statusMessage: "Worker is healthy and waiting for the next due monitor.",
        });
      } catch (error) {
        await updateWorkerState({
          running: true,
          heartbeatAt: new Date(),
          statusMessage: error instanceof Error ? error.message : "Worker cycle failed.",
        });
      }
    } else if (state.running) {
      await updateWorkerState({
        running: false,
        stoppedAt: new Date(),
        heartbeatAt: new Date(),
        pid: process.pid,
        statusMessage: "Worker is paused.",
      });
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

  await updateWorkerState({
    running: false,
    stoppedAt: new Date(),
    heartbeatAt: new Date(),
    statusMessage: "Worker shut down gracefully.",
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shutdown() {
  active = false;
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

void main().catch(async (error) => {
  await updateWorkerState({
    running: false,
    stoppedAt: new Date(),
    heartbeatAt: new Date(),
    statusMessage: error instanceof Error ? error.message : "Worker crashed.",
  });
  process.exitCode = 1;
});
