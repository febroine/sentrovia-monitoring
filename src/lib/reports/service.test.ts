import { describe, expect, it } from "vitest";
import {
  assertReportScheduleCompanyAvailable,
  normalizeReportStatus,
  resolveReportPeriod,
  scheduleNextRunAfter,
} from "@/lib/reports/service";

describe("normalizeReportStatus", () => {
  it("keeps supported status values unchanged", () => {
    expect(normalizeReportStatus("up")).toBe("up");
    expect(normalizeReportStatus("pending")).toBe("pending");
    expect(normalizeReportStatus("down")).toBe("down");
  });

  it("treats unknown legacy status values as pending", () => {
    expect(normalizeReportStatus("unknown")).toBe("pending");
  });
});

describe("scheduleNextRunAfter", () => {
  it("clamps end-of-month schedules instead of skipping February", () => {
    const nextRun = scheduleNextRunAfter(
      new Date("2027-01-31T08:00:00.000Z"),
      "monthly",
      new Date("2027-01-31T09:00:00.000Z")
    );

    expect(nextRun.toISOString()).toBe("2027-02-28T08:00:00.000Z");
  });
});

describe("resolveReportPeriod", () => {
  const now = new Date("2026-08-14T12:00:00.000Z");

  it("uses a rolling seven-day window for weekly reports", () => {
    const period = resolveReportPeriod("weekly", now);

    expect(period.startedAt.toISOString()).toBe("2026-08-07T12:00:00.000Z");
    expect(period.endedAt).toBe(now);
    expect(period.label).toBe("Last 7 days");
  });

  it("uses a rolling thirty-day window for monthly reports", () => {
    const period = resolveReportPeriod("monthly", now);

    expect(period.startedAt.toISOString()).toBe("2026-07-15T12:00:00.000Z");
    expect(period.label).toBe("Last 30 days");
  });
});

describe("report schedule company availability", () => {
  it("rejects company schedules whose company was deleted", () => {
    expect(() => assertReportScheduleCompanyAvailable("company", null)).toThrow(
      "The company assigned to this report schedule is unavailable."
    );
  });

  it("allows workspace schedules without a company", () => {
    expect(() => assertReportScheduleCompanyAvailable("global", null)).not.toThrow();
  });
});
