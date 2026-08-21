import { describe, expect, it } from "vitest";
import {
  formatReportAverageLatency,
  formatReportFailureRate,
  formatReportHealthScore,
  formatReportP95Latency,
  formatReportUptime,
} from "@/lib/reports/metrics";
import type { GeneratedReport } from "@/lib/reports/types";

const NO_DATA_SUMMARY: GeneratedReport["summary"] = {
  monitorCount: 1,
  currentlyUp: 0,
  currentlyDown: 0,
  currentlyPending: 1,
  totalChecks: 0,
  upChecks: 0,
  downChecks: 0,
  pendingChecks: 1,
  hasCompletedChecks: false,
  hasLatencySamples: false,
  uptimePct: 0,
  averageLatencyMs: 0,
  p95LatencyMs: 0,
  failureEvents: 0,
  impactedMonitors: 0,
  failureRatePct: 0,
  healthScore: 0,
  healthStatus: "No data",
};

describe("report metric formatting", () => {
  it("does not present missing measurements as healthy zero values", () => {
    expect(formatReportHealthScore(NO_DATA_SUMMARY)).toBe("No data");
    expect(formatReportUptime(NO_DATA_SUMMARY)).toBe("No data");
    expect(formatReportFailureRate(NO_DATA_SUMMARY)).toBe("No data");
    expect(formatReportP95Latency(NO_DATA_SUMMARY)).toBe("No data");
    expect(formatReportAverageLatency(NO_DATA_SUMMARY)).toBe("No data");
  });
});
