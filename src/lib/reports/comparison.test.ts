import { describe, expect, it } from "vitest";
import { buildReportComparison, formatReportComparison, previousReportPeriod } from "@/lib/reports/comparison";

const period = {
  startedAt: new Date("2026-09-11T12:00:00.000Z"),
  endedAt: new Date("2026-09-18T12:00:00.000Z"),
  timeZone: "Europe/Istanbul",
};

describe("report period comparison", () => {
  it("uses the adjacent equal-duration interval without overlap", () => {
    expect(previousReportPeriod(period)).toEqual({
      startedAt: new Date("2026-09-04T12:00:00.000Z"),
      endedAt: period.startedAt,
      timeZone: period.timeZone,
    });
  });

  it("compares completed checks and calculates the check-based reference budget", () => {
    const comparison = buildReportComparison(period,
      { upChecks: 4_999, downChecks: 1, latencySamples: 5_000, p95LatencyMs: 250 },
      { upChecks: 5_000, downChecks: 0, latencySamples: 5_000, p95LatencyMs: 300 });

    expect(comparison.previousCompletedChecks).toBe(5_000);
    expect(comparison.previousUptimePct).toBe(100);
    expect(comparison.uptimeChangePoints).toBeCloseTo(-0.02);
    expect(comparison.p95LatencyChangeMs).toBe(-50);
    expect(comparison.budgetUsedPct).toBeCloseTo(20);
    expect(comparison.budgetRemainingPct).toBeCloseTo(80);
  });

  it("distinguishes missing prior data from an exhausted budget", () => {
    const empty = { upChecks: 0, downChecks: 0, latencySamples: 0, p95LatencyMs: 0 };
    const noCurrent = buildReportComparison(period, empty, empty);
    expect(noCurrent.uptimeChangePoints).toBeNull();
    expect(noCurrent.budgetRemainingPct).toBeNull();
    expect(formatReportComparison(noCurrent).budget).toBe("No completed checks");

    const overBudget = buildReportComparison(period,
      { upChecks: 998, downChecks: 2, latencySamples: 0, p95LatencyMs: 0 }, empty);
    expect(overBudget.previousUptimePct).toBeNull();
    expect(overBudget.budgetUsedPct).toBeCloseTo(200);
    expect(overBudget.budgetRemainingPct).toBe(0);
    expect(formatReportComparison(overBudget).uptime).toBe("No prior checks");
  });
});
