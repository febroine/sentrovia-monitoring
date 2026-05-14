import { NextRequest, NextResponse } from "next/server";
import { toAuthError } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { updateWorkerState, getWorkerState } from "@/lib/monitors/service";
import type { WorkerObservabilityRange } from "@/lib/monitors/types";
import { getWorkerObservability } from "@/lib/worker/observability";
import { isPidAlive, spawnWorkerProcess } from "@/lib/worker/process";

export const runtime = "nodejs";

function resolveProcessAlive(
  pid: number | null | undefined,
  heartbeatAt: Date | null,
  staleThresholdMs: number
) {
  if (env.disableEmbeddedWorkerSpawn) {
    return heartbeatAt !== null && Date.now() - heartbeatAt.getTime() <= staleThresholdMs;
  }

  return isPidAlive(pid);
}

function serializeWorkerState(
  state: Awaited<ReturnType<typeof getWorkerState>>,
  staleThresholdMs: number,
  observability?: Awaited<ReturnType<typeof getWorkerObservability>>
) {
  return {
    desiredState: state.desiredState,
    running: state.running,
    processAlive: resolveProcessAlive(state.pid, state.heartbeatAt, staleThresholdMs),
    checkedCount: state.checkedCount,
    lastCycleAt: state.lastCycleAt?.toISOString() ?? null,
    lastCycleDurationMs: state.lastCycleDurationMs,
    lastCycleMonitorCount: state.lastCycleMonitorCount,
    lastCycleSuccessCount: state.lastCycleSuccessCount,
    lastCycleFailureCount: state.lastCycleFailureCount,
    lastCyclePendingCount: state.lastCyclePendingCount,
    lastCycleAverageLatencyMs: state.lastCycleAverageLatencyMs,
    lastCycleBacklog: state.lastCycleBacklog,
    lastErrorAt: state.lastErrorAt?.toISOString() ?? null,
    lastErrorMessage: state.lastErrorMessage,
    heartbeatAt: state.heartbeatAt?.toISOString() ?? null,
    startedAt: state.startedAt?.toISOString() ?? null,
    stoppedAt: state.stoppedAt?.toISOString() ?? null,
    pid: state.pid,
    statusMessage: state.statusMessage,
    observability,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const observabilityRange = resolveObservabilityRange(request);
    const state = await getWorkerState();
    const staleThresholdMs = Math.max(env.workerPollIntervalMs * 6, 180_000);
    const heartbeatAgeMs = state.heartbeatAt ? Date.now() - state.heartbeatAt.getTime() : null;
    const processAlive = resolveProcessAlive(state.pid, state.heartbeatAt, staleThresholdMs);
    const staleWorker =
      state.desiredState === "running" &&
      (heartbeatAgeMs === null || heartbeatAgeMs > staleThresholdMs || (!env.disableEmbeddedWorkerSpawn && !processAlive));

    const normalizedState = staleWorker
      ? await updateWorkerState({
          running: false,
          statusMessage: processAlive
            ? "Worker heartbeat expired. Restart the worker process to resume checks."
            : "Worker process is not running. Start the worker to resume checks.",
        })
      : state;

    const observability = await getWorkerObservability(session.id, normalizedState, observabilityRange);
    return NextResponse.json(serializeWorkerState(normalizedState, staleThresholdMs, observability));
  } catch (error) {
    const authError = toAuthError(error, "Unable to load worker state right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const action = await readWorkerAction(request);
    const desiredState = action === "start" ? "running" : "stopped";
    const currentState = await getWorkerState();
    let nextPid = currentState.pid;

    if (action === "start" && !env.disableEmbeddedWorkerSpawn && !isPidAlive(currentState.pid)) {
      nextPid = spawnWorkerProcess();
    }

    const state = await updateWorkerState({
      desiredState,
      pid: nextPid ?? currentState.pid ?? null,
      running: action === "start" ? currentState.running : false,
      statusMessage:
        action === "start"
          ? nextPid
            ? "Worker start requested from the web console."
            : "Worker start requested. Waiting for the runner process to connect."
          : "Worker stop requested from the web console.",
    });

    const observability = await getWorkerObservability(session.id, state);
    return NextResponse.json(serializeWorkerState(state, Math.max(env.workerPollIntervalMs * 6, 180_000), observability));
  } catch (error) {
    const authError = toAuthError(error, "Unable to update worker state right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

async function readWorkerAction(request: NextRequest) {
  const body = (await request.json()) as { action?: unknown };
  return body?.action === "stop" ? "stop" : "start";
}

function resolveObservabilityRange(request: NextRequest): WorkerObservabilityRange {
  const range = request.nextUrl.searchParams.get("range");

  if (range === "1h" || range === "24h" || range === "7d") {
    return range;
  }

  return "24h";
}
