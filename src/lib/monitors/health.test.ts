import { describe, expect, it } from "vitest";
import { isMonitorCheckStale } from "@/lib/monitors/health";

describe("monitor check staleness", () => {
  const now = new Date("2026-07-22T12:00:00.000Z");

  it("does not mark long-interval monitors stale before their next window", () => {
    expect(isMonitorCheckStale({
      lastCheckedAt: new Date("2026-07-22T06:00:00.000Z"),
      nextCheckAt: new Date("2026-07-23T06:00:00.000Z"),
      intervalValue: 24,
      intervalUnit: "sa",
      now,
    })).toBe(false);
  });

  it("marks a monitor stale after it is more than one interval behind", () => {
    expect(isMonitorCheckStale({
      lastCheckedAt: new Date("2026-07-22T11:40:00.000Z"),
      nextCheckAt: new Date("2026-07-22T11:45:00.000Z"),
      intervalValue: 5,
      intervalUnit: "dk",
      now,
    })).toBe(true);
  });

  it("does not mark a monitor stale while its configured timeout is still running", () => {
    expect(isMonitorCheckStale({
      lastCheckedAt: new Date("2026-07-22T11:57:00.000Z"),
      nextCheckAt: new Date("2026-07-22T11:59:00.000Z"),
      intervalValue: 1,
      intervalUnit: "dk",
      timeout: 120_000,
      now,
    })).toBe(false);
  });
});
