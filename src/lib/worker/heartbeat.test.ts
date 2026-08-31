import { describe, expect, it } from "vitest";
import { getHeartbeatAgeMs, isHeartbeatCurrent } from "@/lib/worker/heartbeat";

describe("worker heartbeat timing", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");

  it("accepts only heartbeat timestamps within the clock-skew window", () => {
    expect(isHeartbeatCurrent(new Date("2026-08-24T11:58:00.000Z"), now, 180_000)).toBe(true);
    expect(isHeartbeatCurrent(new Date("2026-08-24T12:02:00.000Z"), now, 180_000)).toBe(true);
    expect(isHeartbeatCurrent(new Date("2026-08-24T12:04:00.000Z"), now, 180_000)).toBe(false);
  });

  it("does not expose negative ages for small accepted clock skew", () => {
    expect(getHeartbeatAgeMs(new Date("2026-08-24T12:02:00.000Z"), now)).toBe(0);
    expect(getHeartbeatAgeMs(null, now)).toBeNull();
  });
});
