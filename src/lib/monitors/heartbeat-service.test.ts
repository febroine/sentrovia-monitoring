import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Monitor } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  acquireMonitorHistoryLocks: vi.fn(),
  appendMonitorEvent: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/monitors/runtime-service", () => ({
  acquireMonitorHistoryLocks: mocks.acquireMonitorHistoryLocks,
}));
vi.mock("@/lib/monitors/runtime-store", () => ({ appendMonitorEvent: mocks.appendMonitorEvent }));
vi.mock("@/lib/security/encryption", () => ({
  encryptValue: (value: string) => `encrypted:${value}`,
  hashSecretValue: () => "hashed-heartbeat-token",
}));

import { receiveHeartbeat } from "@/lib/monitors/heartbeat-service";

describe("heartbeat history serialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acquires the monitor history lock and revalidates the token before writing", async () => {
    const monitor = buildHeartbeatMonitor();
    const selectResults = [[], [monitor], [], [monitor]];
    const returningResults = [[monitor], [{ ...monitor, heartbeatLastReceivedAt: new Date("2026-09-14T10:00:00.000Z") }]];
    const limit = vi.fn(async () => selectResults.shift() ?? []);
    const whereSelect = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where: whereSelect }));
    const returning = vi.fn(async () => returningResults.shift() ?? []);
    const whereUpdate = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where: whereUpdate }));
    const tx = {
      select: vi.fn(() => ({ from })),
      update: vi.fn(() => ({ set })),
    };
    mocks.transaction.mockImplementation((operation) => operation(tx));
    mocks.acquireMonitorHistoryLocks.mockResolvedValue(undefined);
    mocks.appendMonitorEvent.mockResolvedValue(undefined);

    const result = await receiveHeartbeat("heartbeat-secret-token-for-reset", new Date("2026-09-14T10:00:00.000Z"));

    expect(result?.accepted).toBe(true);
    expect(mocks.acquireMonitorHistoryLocks).toHaveBeenCalledWith(tx, [monitor.id]);
    expect(from).toHaveBeenCalledTimes(4);
    expect(mocks.acquireMonitorHistoryLocks.mock.invocationCallOrder[0]).toBeLessThan(tx.update.mock.invocationCallOrder[0]);
    expect(mocks.appendMonitorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ monitorId: monitor.id, eventType: "heartbeat-received" }),
      tx
    );
  });
});

function buildHeartbeatMonitor(): Monitor {
  return {
    id: "monitor-1",
    monitorType: "heartbeat",
    heartbeatToken: null,
    heartbeatTokenHash: "hashed-heartbeat-token",
    isActive: true,
    pausedUntil: null,
    deletedAt: null,
    userId: "user-1",
    status: "up",
    statusCode: null,
  } as Monitor;
}
