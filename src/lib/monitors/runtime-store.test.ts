import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { select: mocks.select, insert: mocks.insert } }));

import {
  appendMonitorCheck,
  appendMonitorDiagnostic,
  appendMonitorEvent,
  appendOutageEvent,
} from "@/lib/monitors/runtime-store";
import { monitorChecks, monitorDiagnostics, monitorEvents, outageEvents } from "@/lib/db/schema";
import { openOrUpdateOutage, resolveOutage } from "@/lib/outages/service";

const subject = { monitorId: "monitor-in-b", userId: "user-with-first-workspace-a" };
const now = new Date("2026-09-09T10:00:00Z");
const writers = [
  {
    name: "events",
    table: monitorEvents,
    write: (workspaceId?: string) => appendMonitorEvent({ ...subject, workspaceId, eventType: "failure" }),
  },
  {
    name: "checks",
    table: monitorChecks,
    write: (workspaceId?: string) => appendMonitorCheck({ ...subject, workspaceId, status: "down", createdAt: now }),
  },
  {
    name: "diagnostics",
    table: monitorDiagnostics,
    write: (workspaceId?: string) => appendMonitorDiagnostic({
      ...subject,
      workspaceId,
      diagnostic: {
        status: "failed", failedPhase: "dns", failureCategory: null, summary: "DNS failed",
        dnsStatus: "failed", resolvedIps: [], tcpStatus: "skipped", tlsStatus: "skipped",
        httpStatus: "skipped", httpStatusCode: null, responseTimeMs: null,
        timeoutMs: 1000, errorMessage: "DNS failed", createdAt: now,
      },
    }),
  },
  {
    name: "outage timeline",
    table: outageEvents,
    write: (workspaceId?: string) => appendOutageEvent({ ...subject, workspaceId, eventType: "outage_confirmed", title: "Outage" }),
  },
];

describe.each(writers)("monitor workspace for $name", ({ table, write }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limit.mockResolvedValue([{ workspaceId: "workspace-b" }]);
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: mocks.limit }) }) });
    mocks.values.mockResolvedValue(undefined);
    mocks.insert.mockReturnValue({ values: mocks.values });
  });

  it("uses the referenced monitor workspace when the worker omits scope", async () => {
    await write();
    expect(mocks.insert).toHaveBeenCalledWith(table);
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ ...subject, workspaceId: "workspace-b" }));
  });

  it("accepts a matching explicit workspace", async () => {
    await write("workspace-b");
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace-b" }));
  });

  it("rejects a mismatched workspace before persisting history", async () => {
    await expect(write("workspace-a")).rejects.toThrow("Monitor not found in this workspace.");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not record history for a missing monitor", async () => {
    mocks.limit.mockResolvedValue([]);
    await expect(write()).rejects.toThrow("Monitor not found in this workspace.");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("outage state workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limit.mockResolvedValue([{ workspaceId: "workspace-b" }]);
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: mocks.limit }) }) });
    mocks.values.mockReturnValue({
      onConflictDoUpdate: () => ({ returning: async () => [{ id: "outage-b" }] }),
    });
    mocks.insert.mockReturnValue({ values: mocks.values });
  });

  it("opens the outage in the monitor's workspace even without an explicit scope", async () => {
    await openOrUpdateOutage({ ...subject, checkedAt: now, statusCode: 500, errorMessage: "Failed" });
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace-b" }));
  });

  it("rejects opening an outage in another workspace", async () => {
    await expect(openOrUpdateOutage({
      ...subject, workspaceId: "workspace-a", checkedAt: now, statusCode: 500, errorMessage: "Failed",
    })).rejects.toThrow("Monitor not found in this workspace.");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects resolving an outage with mismatched workspace scope", async () => {
    await expect(resolveOutage({
      ...subject, workspaceId: "workspace-a", checkedAt: now, statusCode: 200,
    })).rejects.toThrow("Monitor not found in this workspace.");
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });
});
