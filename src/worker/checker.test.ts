import { describe, expect, it, vi } from "vitest";
import type { Monitor } from "@/lib/db/schema";

vi.mock("@/worker/check-heartbeat", () => ({ checkHeartbeatMonitor: vi.fn() }));
vi.mock("@/worker/check-http", () => ({ checkHttpMonitor: vi.fn() }));
vi.mock("@/worker/check-ping", () => ({ checkPingMonitor: vi.fn() }));
vi.mock("@/worker/check-port", () => ({ checkPortMonitor: vi.fn() }));
vi.mock("@/worker/check-postgres", () => ({ checkPostgresMonitor: vi.fn() }));

import { calculateNextCheckAt, checkMonitor } from "@/worker/checker";
import { checkHttpMonitor } from "@/worker/check-http";

describe("monitor checker dispatch", () => {
  it("does not silently treat an unknown monitor type as HTTP", async () => {
    const result = await checkMonitor({ monitorType: "unknown" } as Monitor);

    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe("configuration");
    expect(result.errorMessage).toContain("Unsupported monitor type");
  });

  it("turns an unexpected checker rejection into a persisted configuration result", async () => {
    vi.mocked(checkHttpMonitor).mockRejectedValueOnce(new Error("Checker failed unexpectedly."));

    const result = await checkMonitor({ monitorType: "http" } as Monitor);

    expect(result.failureReason).toBe("configuration");
    expect(result.errorMessage).toBe("Checker failed unexpectedly.");
  });

  it("does not schedule the next check before a long check completes", () => {
    const monitor = { intervalValue: 10, intervalUnit: "sn" } as Monitor;
    const checkedAt = new Date("2026-05-08T07:00:00.000Z");
    const completedAt = new Date("2026-05-08T07:00:15.000Z");

    expect(calculateNextCheckAt(monitor, checkedAt, completedAt)).toEqual(completedAt);
  });

  it("schedules heartbeat checks at the interval and grace deadline", () => {
    const monitor = {
      monitorType: "heartbeat",
      heartbeatLastReceivedAt: new Date("2026-05-08T07:00:00.000Z"),
      intervalValue: 5,
      intervalUnit: "dk",
      timeout: 60_000,
    } as Monitor;
    const checkedAt = new Date("2026-05-08T07:05:00.000Z");

    expect(calculateNextCheckAt(monitor, checkedAt)).toEqual(
      new Date("2026-05-08T07:06:00.001Z")
    );
  });
});
