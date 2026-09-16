import { describe, expect, it } from "vitest";
import { getExecutiveInsights, getMonitorRiskPoints } from "@/lib/reports/analytics-insights";
import type { GeneratedReport } from "@/lib/reports/types";

const baseReport = {
  dailyMetrics: [
    { date: "2026-09-14", upChecks: 1000, downChecks: 0, uptimePct: 100 },
    { date: "2026-09-15", upChecks: 99, downChecks: 1, uptimePct: 99 },
    { date: "2026-09-16", upChecks: 0, downChecks: 0, uptimePct: 0 },
  ],
  monitorBreakdown: [
    { monitorId: "one", name: "API", failures: 3, hasCompletedChecks: true, hasLatencySamples: true, uptimePct: 98, p95LatencyMs: 500 },
    { monitorId: "two", name: "Web", failures: 1, hasCompletedChecks: true, hasLatencySamples: true, uptimePct: 100, p95LatencyMs: 200 },
    { monitorId: "three", name: "Pending", failures: 0, hasCompletedChecks: false, hasLatencySamples: false, uptimePct: 0, p95LatencyMs: 0 },
  ],
} as GeneratedReport;

describe("executive analytics insights", () => {
  it("counts only observed days and separates missing monitor data", () => {
    expect(getExecutiveInsights(baseReport)).toEqual({
      observedDays: 2,
      daysAtReference: 1,
      belowReference: 1,
      missingData: 1,
      leadingFailure: { name: "API", failures: 3, sharePct: 75 },
    });
  });

  it("uses the fleet P95 median only when both uptime and latency are measured", () => {
    expect(getMonitorRiskPoints(baseReport)).toMatchObject({ medianLatencyMs: 350 });
    expect(getMonitorRiskPoints({ ...baseReport, monitorBreakdown: [] }).medianLatencyMs).toBeNull();
    expect(getExecutiveInsights({ ...baseReport, dailyMetrics: [], monitorBreakdown: [] }).leadingFailure).toBeNull();
  });
});
