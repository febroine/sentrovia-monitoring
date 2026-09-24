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
    { monitorId: "one", name: "API", incidentCount: 3, hasCompletedChecks: true, hasUptimeData: true, hasLatencySamples: true, uptimePct: 98, p95LatencyMs: 500 },
    { monitorId: "two", name: "Web", incidentCount: 1, hasCompletedChecks: true, hasUptimeData: true, hasLatencySamples: true, uptimePct: 100, p95LatencyMs: 200 },
    { monitorId: "three", name: "Pending", incidentCount: 0, hasCompletedChecks: false, hasUptimeData: false, hasLatencySamples: false, uptimePct: 0, p95LatencyMs: 0 },
  ],
} as GeneratedReport;

describe("executive analytics insights", () => {
  it("counts only observed days and separates missing monitor data", () => {
    expect(getExecutiveInsights(baseReport)).toEqual({
      observedDays: 2,
      daysAtReference: 1,
      belowReference: 1,
      missingData: 1,
      leadingOutage: { name: "API", incidentCount: 3 },
    });
  });

  it("uses the fleet P95 median only when both uptime and latency are measured", () => {
    expect(getMonitorRiskPoints(baseReport)).toMatchObject({ medianLatencyMs: 350 });
    expect(getMonitorRiskPoints({ ...baseReport, monitorBreakdown: [] }).medianLatencyMs).toBeNull();
    expect(getExecutiveInsights({ ...baseReport, dailyMetrics: [], monitorBreakdown: [] }).leadingOutage).toBeNull();
  });
});
