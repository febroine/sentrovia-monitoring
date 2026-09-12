import { afterEach, describe, expect, it, vi } from "vitest";
import type { MonitorPayload, MonitorRecord, MonitorSummary } from "@/lib/monitors/types";
import { useMonitoringStore } from "@/stores/use-monitoring-store";

describe("monitoring store request ordering", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useMonitoringStore.setState({
      monitors: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
      summary: emptySummary(),
      loading: true,
      saving: false,
      error: null,
    });
  });

  it("does not let an older query overwrite the latest monitor page", async () => {
    const olderRequest = createPendingResponse();
    const olderMonitor = { id: "monitor-old", name: "Old result" } as MonitorRecord;
    const latestMonitor = { id: "monitor-latest", name: "Latest result" } as MonitorRecord;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => olderRequest.promise)
      .mockResolvedValueOnce(monitorResponse(latestMonitor, 2));
    vi.stubGlobal("fetch", fetchMock);

    const olderLoad = useMonitoringStore.getState().loadMonitors({
      page: 1,
      pageSize: 10,
      search: "old",
    });
    await useMonitoringStore.getState().loadMonitors({
      page: 2,
      pageSize: 10,
      search: "latest",
    });
    olderRequest.resolve(monitorResponse(olderMonitor, 1));
    await olderLoad;

    expect(useMonitoringStore.getState()).toMatchObject({
      monitors: [latestMonitor],
      pagination: { page: 2 },
      loading: false,
      error: null,
    });
  });

  it("ignores a rejected older query after the latest query succeeds", async () => {
    const olderRequest = createPendingResponse();
    const latestMonitor = { id: "monitor-latest", name: "Latest result" } as MonitorRecord;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => olderRequest.promise)
      .mockResolvedValueOnce(monitorResponse(latestMonitor, 2));
    vi.stubGlobal("fetch", fetchMock);

    const olderLoad = useMonitoringStore.getState().loadMonitors({ page: 1, pageSize: 10 });
    await useMonitoringStore.getState().loadMonitors({ page: 2, pageSize: 10 });
    olderRequest.reject(new Error("older request failed"));
    await olderLoad;

    expect(useMonitoringStore.getState()).toMatchObject({
      monitors: [latestMonitor],
      pagination: { page: 2 },
      loading: false,
      error: null,
    });
  });

  it("does not let a load started before create remove the created monitor", async () => {
    const olderRequest = createPendingResponse();
    const staleMonitor = { id: "monitor-stale", name: "Stale result" } as MonitorRecord;
    const createdMonitor = { id: "monitor-created", name: "Created monitor" } as MonitorRecord;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => olderRequest.promise)
      .mockResolvedValueOnce(Response.json({ monitor: createdMonitor }, { status: 201 })));

    const olderLoad = useMonitoringStore.getState().loadMonitors({ page: 1, pageSize: 10 });
    const create = useMonitoringStore.getState().createMonitor({} as MonitorPayload);
    expect(useMonitoringStore.getState().loading).toBe(true);
    await create;
    olderRequest.resolve(monitorResponse(staleMonitor, 1));
    await olderLoad;

    expect(useMonitoringStore.getState()).toMatchObject({
      monitors: [createdMonitor],
      loading: false,
      saving: false,
      error: null,
    });
  });

  it("invalidates a load started during create when the mutation succeeds", async () => {
    const createRequest = createPendingResponse();
    const overlappingLoadRequest = createPendingResponse();
    const createdMonitor = { id: "monitor-created", name: "Created monitor" } as MonitorRecord;
    const staleMonitor = { id: "monitor-stale", name: "Pre-create catalog" } as MonitorRecord;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => createRequest.promise)
      .mockImplementationOnce(() => overlappingLoadRequest.promise));

    const create = useMonitoringStore.getState().createMonitor({} as MonitorPayload);
    const overlappingLoad = useMonitoringStore.getState().loadMonitors({ page: 1, pageSize: 10 });
    createRequest.resolve(Response.json({ monitor: createdMonitor }, { status: 201 }));
    await create;

    expect(useMonitoringStore.getState()).toMatchObject({
      monitors: [createdMonitor],
      loading: true,
      saving: false,
      error: null,
    });

    overlappingLoadRequest.resolve(monitorResponse(staleMonitor, 1));
    await overlappingLoad;

    expect(useMonitoringStore.getState()).toMatchObject({
      monitors: [createdMonitor],
      loading: false,
      saving: false,
      error: null,
    });
  });

  it("ignores a rejected load started during a successful update", async () => {
    const updateRequest = createPendingResponse();
    const overlappingLoadRequest = createPendingResponse();
    const originalMonitor = { id: "monitor-1", name: "Original" } as MonitorRecord;
    const updatedMonitor = { id: "monitor-1", name: "Updated" } as MonitorRecord;
    useMonitoringStore.setState({ monitors: [originalMonitor], loading: false });
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => updateRequest.promise)
      .mockImplementationOnce(() => overlappingLoadRequest.promise));

    const update = useMonitoringStore.getState().updateMonitor("monitor-1", {} as MonitorPayload);
    const overlappingLoad = useMonitoringStore.getState().loadMonitors({ page: 1, pageSize: 10 });
    updateRequest.resolve(Response.json({ monitor: updatedMonitor }));
    await update;
    overlappingLoadRequest.reject(new Error("stale overlapping load failed"));
    await overlappingLoad;

    expect(useMonitoringStore.getState()).toMatchObject({
      monitors: [updatedMonitor],
      loading: false,
      saving: false,
      error: null,
    });
  });

  it("ignores an older load error after a monitor update succeeds", async () => {
    const olderRequest = createPendingResponse();
    const originalMonitor = { id: "monitor-1", name: "Original" } as MonitorRecord;
    const updatedMonitor = { id: "monitor-1", name: "Updated" } as MonitorRecord;
    useMonitoringStore.setState({ monitors: [originalMonitor], loading: false });
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => olderRequest.promise)
      .mockResolvedValueOnce(Response.json({ monitor: updatedMonitor })));

    const olderLoad = useMonitoringStore.getState().loadMonitors({ page: 1, pageSize: 10 });
    await useMonitoringStore.getState().updateMonitor("monitor-1", {} as MonitorPayload);
    olderRequest.reject(new Error("stale load failed"));
    await olderLoad;

    expect(useMonitoringStore.getState()).toMatchObject({
      monitors: [updatedMonitor],
      loading: false,
      saving: false,
      error: null,
    });
  });
});

function emptySummary(): MonitorSummary {
  return {
    total: 0,
    active: 0,
    paused: 0,
    online: 0,
    offline: 0,
    pending: 0,
    nextPauseExpiryAt: null,
  };
}

function monitorResponse(monitor: MonitorRecord, page: number) {
  return new Response(JSON.stringify({
    monitors: [monitor],
    pagination: { page, pageSize: 10, totalItems: 11, totalPages: 2 },
    summary: emptySummary(),
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function createPendingResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  return { promise, reject, resolve };
}
