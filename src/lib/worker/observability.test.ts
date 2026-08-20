import { describe, expect, it } from "vitest";
import { getLatestDate, isObservedMonitorStale } from "@/lib/worker/observability";

describe("worker observability helpers", () => {
  it("resolves the latest failure timestamp regardless of input ordering", () => {
    const latest = getLatestDate([
      new Date("2026-05-08T07:02:00.000Z"),
      new Date("2026-05-08T06:58:00.000Z"),
      new Date("2026-05-08T07:05:00.000Z"),
    ]);

    expect(latest?.toISOString()).toBe("2026-05-08T07:05:00.000Z");
  });

  it("returns null when no failure timestamps are available", () => {
    expect(getLatestDate([])).toBeNull();
  });

  it("does not flag a long-interval monitor before its own due window", () => {
    expect(isObservedMonitorStale({
      lastCheckedAt: new Date("2026-07-22T06:00:00.000Z"),
      nextCheckAt: new Date("2026-07-23T06:00:00.000Z"),
      intervalValue: 24,
      intervalUnit: "sa",
      timeout: 60_000,
    }, new Date("2026-07-22T12:00:00.000Z"))).toBe(false);
  });
});
