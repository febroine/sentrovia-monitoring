import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { updateWorkerState, getWorkerState } from "@/lib/monitors/service";
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
  staleThresholdMs: number
) {
  return {
    desiredState: state.desiredState,
    running: state.running,
    processAlive: resolveProcessAlive(state.pid, state.heartbeatAt, staleThresholdMs),
    checkedCount: state.checkedCount,
    lastCycleAt: state.lastCycleAt?.toISOString() ?? null,
    heartbeatAt: state.heartbeatAt?.toISOString() ?? null,
    startedAt: state.startedAt?.toISOString() ?? null,
    stoppedAt: state.stoppedAt?.toISOString() ?? null,
    pid: state.pid,
    statusMessage: state.statusMessage,
  };
}

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

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

  return NextResponse.json(serializeWorkerState(normalizedState, staleThresholdMs));
}

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body?.action === "stop" ? "stop" : "start";
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

  return NextResponse.json(serializeWorkerState(state, Math.max(env.workerPollIntervalMs * 6, 180_000)));
}
