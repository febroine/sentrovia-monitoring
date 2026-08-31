import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkerStatus } from "@/lib/monitors/types";
import { useWorkerStore } from "@/stores/use-worker-store";

describe("worker store request ordering", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useWorkerStore.setState({
      worker: null,
      loading: true,
      commandLoading: false,
      error: null,
    });
  });

  it("does not let an older poll overwrite a worker command response", async () => {
    const pendingPoll = createPendingResponse();
    const stopped = buildWorkerStatus({ desiredState: "stopped", running: false });
    const running = buildWorkerStatus({ desiredState: "running", running: true });
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => pendingPoll.promise)
      .mockResolvedValueOnce(jsonResponse(running));
    vi.stubGlobal("fetch", fetchMock);
    useWorkerStore.setState({ worker: stopped, loading: false });

    const poll = useWorkerStore.getState().loadWorker();
    await useWorkerStore.getState().toggleWorker();
    pendingPoll.resolve(jsonResponse(stopped));
    await poll;

    expect(useWorkerStore.getState().worker).toEqual(running);
    expect(useWorkerStore.getState().commandLoading).toBe(false);
  });
});

function buildWorkerStatus(overrides: Partial<WorkerStatus>): WorkerStatus {
  return {
    desiredState: "stopped",
    running: false,
    processAlive: false,
    checkedCount: 0,
    lastCycleAt: null,
    lastCycleDurationMs: null,
    lastCycleMonitorCount: 0,
    lastCycleSuccessCount: 0,
    lastCycleFailureCount: 0,
    lastCyclePendingCount: 0,
    lastCycleAverageLatencyMs: null,
    lastCycleBacklog: 0,
    lastErrorAt: null,
    lastErrorMessage: null,
    heartbeatAt: null,
    startedAt: null,
    stoppedAt: null,
    pid: null,
    statusMessage: null,
    connectivityStatus: "unknown",
    connectivityCheckedAt: null,
    connectivityMessage: null,
    ...overrides,
  };
}

function createPendingResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
