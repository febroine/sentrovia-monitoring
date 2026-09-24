import { describe, expect, it } from "vitest";
import {
  buildMonthlyAvailabilityWindows,
  normalizePerMonitorLimit,
  resolveCompanyMonthlyReportStart,
  resolveCompanyRecentChecksStart,
} from "@/lib/monitors/insights";

describe("monitor insight history limits", () => {
  it("normalizes invalid and fractional per-monitor limits", () => {
    expect(normalizePerMonitorLimit(Number.NaN)).toBe(1);
    expect(normalizePerMonitorLimit(0)).toBe(1);
    expect(normalizePerMonitorLimit(4.9)).toBe(4);
  });

  it("caps unexpectedly large history requests", () => {
    expect(normalizePerMonitorLimit(10_000)).toBe(100);
  });
});

describe("company insight windows", () => {
  it("uses an exact rolling seven-day window for recent company checks", () => {
    const now = new Date("2026-08-25T09:30:00.000Z");

    expect(resolveCompanyRecentChecksStart(now)).toEqual(new Date("2026-08-18T09:30:00.000Z"));
  });

  it("starts the six-month report at the first day without month-end rollover", () => {
    expect(resolveCompanyMonthlyReportStart(new Date("2026-07-31T18:45:00.000Z"))).toEqual(
      new Date("2026-02-01T00:00:00.000Z")
    );
  });

  it("builds historical months without counting time after the report ends", () => {
    const windows = buildMonthlyAvailabilityWindows(
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-04-15T12:00:00Z")
    );
    expect(windows.map((window) => window.key)).toEqual(["2026-02", "2026-03", "2026-04"]);
    expect(windows[2].endedAt).toEqual(new Date("2026-04-15T12:00:00Z"));
  });
});
