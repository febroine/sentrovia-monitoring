import { describe, expect, it } from "vitest";
import { buildCalendarLayout, dayLevel, summarizeDays } from "@/components/monitoring/daily-availability-calendar";
import type { DailyAvailability } from "@/lib/monitors/daily-availability";

const DAY_MS = 24 * 60 * 60 * 1000;

function day(date: string, overrides: Partial<DailyAvailability> = {}): DailyAvailability {
  return {
    date,
    hasData: true,
    incompleteHistory: false,
    uptimePct: 100,
    observedMs: DAY_MS,
    downtimeMs: 0,
    incidentCount: 0,
    completedChecks: 1440,
    ...overrides,
  };
}

describe("dayLevel", () => {
  it("grades a day by its downtime", () => {
    expect(dayLevel(day("2026-10-01"))).toBe("good");
    expect(dayLevel(day("2026-10-01", { downtimeMs: 60_000, uptimePct: 99.93 }))).toBe("minor");
    expect(dayLevel(day("2026-10-01", { downtimeMs: 3_600_000, uptimePct: 95.83 }))).toBe("major");
    expect(dayLevel(day("2026-10-01", { downtimeMs: 7_200_000, uptimePct: 91.67 }))).toBe("critical");
  });

  it("does not grade days without data or with incomplete history", () => {
    expect(dayLevel(day("2026-10-01", { hasData: false, uptimePct: 0 }))).toBe("none");
    expect(dayLevel(day("2026-10-01", { hasData: false, incompleteHistory: true }))).toBe("partial");
  });
});

describe("buildCalendarLayout", () => {
  it("starts weeks on Monday and pads both ends", () => {
    // 2026-10-01 is a Thursday.
    const layout = buildCalendarLayout([day("2026-10-01"), day("2026-10-02"), day("2026-10-03"), day("2026-10-04"), day("2026-10-05")]);
    expect(layout.cells.slice(0, 3)).toEqual([null, null, null]);
    expect(layout.cells[3]?.date).toBe("2026-10-01");
    expect(layout.cells[7]?.date).toBe("2026-10-05");
    expect(layout.cells).toHaveLength(14);
    expect(layout.weeks.map((week) => week.monthLabel)).toEqual(["Oct", ""]);
  });

  it("names a month above the first week that starts in it", () => {
    const days = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"].map((date) => day(date));
    expect(buildCalendarLayout(days).weeks.map((week) => week.monthLabel)).toEqual(["Sept", "Oct"]);
  });
});

describe("summarizeDays", () => {
  it("weights uptime by observed time and counts days with downtime", () => {
    const summary = summarizeDays([
      day("2026-10-01"),
      day("2026-10-02", { downtimeMs: DAY_MS / 10, uptimePct: 90 }),
      day("2026-10-03", { hasData: false, observedMs: 0 }),
    ]);
    expect(summary.uptimePct).toBeCloseTo(95);
    expect(summary.downDays).toBe(1);
  });

  it("has no uptime without data", () => {
    expect(summarizeDays([day("2026-10-01", { hasData: false, observedMs: 0 })]).uptimePct).toBeNull();
  });
});
