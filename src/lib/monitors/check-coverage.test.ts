import { describe, expect, it } from "vitest";
import { estimateReportCheckCoverage, formatReportCheckCoverage, getCheckScheduleIssue } from "@/lib/monitors/check-coverage";

const now = new Date("2026-09-18T12:00:00.000Z");
const scheduled = {
  monitorType: "http", isActive: true, pausedUntil: null,
  nextCheckAt: "2026-09-18T11:50:00.000Z", intervalValue: 5, intervalUnit: "dk", timeout: 30_000,
};

describe("check coverage", () => {
  it("flags overdue and missing schedules without treating normal, paused or heartbeat monitors as overdue", () => {
    expect(getCheckScheduleIssue(scheduled, now)).toBe("overdue");
    expect(getCheckScheduleIssue({ ...scheduled, nextCheckAt: "2026-09-18T11:56:00.000Z" }, now)).toBeNull();
    expect(getCheckScheduleIssue({ ...scheduled, nextCheckAt: null }, now)).toBe("missing");
    expect(getCheckScheduleIssue({ ...scheduled, pausedUntil: "2026-09-18T13:00:00.000Z" }, now)).toBeNull();
    expect(getCheckScheduleIssue({ ...scheduled, monitorType: "heartbeat" }, now)).toBeNull();
  });

  it("estimates only eligible scheduled checks and counts pending attempts as actual", () => {
    const period = { startedAt: new Date("2026-09-18T10:00:00.000Z"), endedAt: new Date("2026-09-18T14:00:00.000Z") };
    const coverage = estimateReportCheckCoverage(period, now, [
      { id: "http", monitorType: "http", createdAt: period.startedAt, pausedUntil: null, intervalValue: 5, intervalUnit: "dk" },
      { id: "heartbeat", monitorType: "heartbeat", createdAt: period.startedAt, pausedUntil: null, intervalValue: 5, intervalUnit: "dk" },
      { id: "paused", monitorType: "http", createdAt: period.startedAt, pausedUntil: new Date("2026-09-18T11:00:00.000Z"), intervalValue: 5, intervalUnit: "dk" },
    ], new Map([["http", { totalChecks: 20, pendingChecks: 2 }]]));

    expect(coverage).toEqual({ actualChecks: 22, expectedChecks: 24, eligibleMonitors: 1, excludedMonitors: 2 });
    expect(formatReportCheckCoverage(coverage).value).toBe("22 / ~24 checks");
  });

  it("does not present an unavailable estimate as zero coverage", () => {
    expect(formatReportCheckCoverage({ actualChecks: 0, expectedChecks: 0, eligibleMonitors: 0, excludedMonitors: 1 }).value)
      .toBe("Estimate unavailable");
  });

  it("does not expect a check before a new monitor's first scheduled run", () => {
    const startedAt = new Date("2026-09-18T10:00:00.000Z");
    const endedAt = new Date("2026-09-18T10:10:00.000Z");
    const coverage = estimateReportCheckCoverage({ startedAt, endedAt }, endedAt, [{
      id: "new", monitorType: "http", createdAt: new Date("2026-09-18T10:09:00.000Z"),
      lastCheckedAt: null, nextCheckAt: new Date("2026-09-18T10:11:00.000Z"),
      pausedUntil: null, intervalValue: 5, intervalUnit: "dk",
    }], new Map());

    expect(coverage).toEqual({ actualChecks: 0, expectedChecks: 0, eligibleMonitors: 0, excludedMonitors: 1 });
  });
});
