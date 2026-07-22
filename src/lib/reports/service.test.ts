import { describe, expect, it } from "vitest";
import {
  assertReportScheduleCompanyAvailable,
  normalizeReportStatus,
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
