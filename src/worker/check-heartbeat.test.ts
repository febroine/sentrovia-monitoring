import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monitor } from "@/lib/db/schema";
import { checkHeartbeatMonitor } from "@/worker/check-heartbeat";

describe("heartbeat monitor checks", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not report heartbeat age as network latency", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T10:05:00.000Z"));

    const result = await checkHeartbeatMonitor({
      heartbeatLastReceivedAt: new Date("2026-07-10T10:00:00.000Z"),
      intervalValue: 10,
      intervalUnit: "dk",
    } as Monitor);

    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeNull();
  });
});
