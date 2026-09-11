import { describe, expect, it } from "vitest";
import { isMonitorTemporarilyPaused, resolveMonitorPauseUntil } from "@/lib/monitors/pause";

describe("monitor pause helpers", () => {
  const now = new Date("2026-09-11T10:00:00.000Z");

  it("resolves durations for each supported unit", () => {
    expect(resolveMonitorPauseUntil(30, "minutes", now).toISOString()).toBe("2026-09-11T10:30:00.000Z");
    expect(resolveMonitorPauseUntil(2, "hours", now).toISOString()).toBe("2026-09-11T12:00:00.000Z");
    expect(resolveMonitorPauseUntil(3, "days", now).toISOString()).toBe("2026-09-14T10:00:00.000Z");
  });

  it("rejects invalid and excessive durations", () => {
    expect(() => resolveMonitorPauseUntil(0, "minutes", now)).toThrow();
    expect(() => resolveMonitorPauseUntil(366, "days", now)).toThrow();
  });

  it("only treats future timestamps as paused", () => {
    expect(isMonitorTemporarilyPaused("2026-09-11T10:01:00.000Z", now)).toBe(true);
    expect(isMonitorTemporarilyPaused("2026-09-11T10:00:00.000Z", now)).toBe(false);
    expect(isMonitorTemporarilyPaused(null, now)).toBe(false);
  });
});
