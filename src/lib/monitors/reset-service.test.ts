import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordAuditEventSafely: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { transaction: mocks.transaction },
}));
vi.mock("@/lib/audit/service", () => ({
  recordAuditEventSafely: mocks.recordAuditEventSafely,
}));

import {
  deliveryEvents,
  monitorChecks,
  monitorDiagnostics,
  monitorEvents,
  monitorOutages,
  outageEvents,
} from "@/lib/db/schema";
import { resetMonitorHistory } from "@/lib/monitors/service";

describe("monitor history reset service", () => {
  const resetMonitor = {
    id: "monitor-1",
    workspaceId: "workspace-1",
    userId: "user-1",
    name: "Customer API",
    status: "pending",
  };
  const removeHistory = vi.fn(async () => []);
  const returning = vi.fn(async () => [resetMonitor]);
  const set = vi.fn(() => ({ where: vi.fn(() => ({ returning })) }));
  const removeFrom = vi.fn<(table: unknown) => { where: typeof removeHistory }>()
    .mockImplementation(() => ({ where: removeHistory }));
  const tx = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(async () => [{ id: resetMonitor.id }]) })),
    })),
    delete: removeFrom,
    execute: vi.fn(async () => []),
    update: vi.fn(() => ({ set })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (operation) => operation(tx));
  });

  it("clears every monitor-owned operational history table and records an audit event", async () => {
    const result = await resetMonitorHistory("user-1", [resetMonitor.id], "workspace-1");

    expect(result).toEqual([resetMonitor]);
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(tx.execute.mock.invocationCallOrder[0]).toBeLessThan(removeFrom.mock.invocationCallOrder[0]);
    expect(removeFrom.mock.calls.map(([table]) => table)).toEqual([
      deliveryEvents,
      outageEvents,
      monitorOutages,
      monitorDiagnostics,
      monitorEvents,
      monitorChecks,
    ]);
    expect(removeHistory).toHaveBeenCalledTimes(6);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      status: "pending",
      uptime: "--",
      heartbeatLastReceivedAt: null,
      lastCheckedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      leaseToken: null,
      leaseExpiresAt: null,
    }));
    expect(mocks.recordAuditEventSafely).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      entityId: resetMonitor.id,
      action: "monitor.history.reset",
    }));
  });
});
