import { describe, expect, it } from "vitest";
import {
  formatMonitorAverageLatency,
  formatMonitorDowntime,
  formatMonitorOutageCount,
  formatMonitorP95Latency,
  formatMonitorUptime,
  formatOutageDuration,
  formatReportAverageLatency,
  formatReportDowntime,
  formatReportFailureRate,
  formatReportHealthScore,
  formatReportOutageCount,
  formatReportP95Latency,
  formatReportUptime,
} from "@/lib/reports/metrics";
import type { GeneratedReport } from "@/lib/reports/types";

const NO_DATA_SUMMARY: GeneratedReport["summary"] = {
  monitorCount: 1,
  currentlyUp: 0,
  currentlyDown: 0,
  currentlyPending: 1,
  currentlyPaused: 0,
  totalChecks: 0,
  upChecks: 0,
  downChecks: 0,
  pendingChecks: 1,
  hasCompletedChecks: false,
  hasUptimeData: false,
  incompleteOutageHistory: false,
  hasLatencySamples: false,
  uptimePct: 0,
  averageLatencyMs: 0,
  p95LatencyMs: 0,
  failureEvents: 0,
  incidentCount: 0,
  downtimeMs: 0,
  impactedMonitors: 0,
  failureRatePct: 0,
  healthScore: 0,
  healthStatus: "No data",
};

describe("report metric formatting", () => {
  it("formats total outage duration without hiding short incidents", () => {
    expect(formatOutageDuration(0)).toBe("0s");
    expect(formatOutageDuration(30_000)).toBe("30s");
    expect(formatOutageDuration(90_000)).toBe("1m 30s");
    expect(formatOutageDuration(26 * 60 * 60_000)).toBe("1d 2h");
  });
  it("does not present missing measurements as healthy zero values", () => {
    expect(formatReportHealthScore(NO_DATA_SUMMARY)).toBe("No data");
    expect(formatReportUptime(NO_DATA_SUMMARY)).toBe("No data");
    expect(formatReportOutageCount(NO_DATA_SUMMARY)).toBe("No data");
    expect(formatReportDowntime(NO_DATA_SUMMARY)).toBe("No data");
    expect(formatReportOutageCount({ ...NO_DATA_SUMMARY, incidentCount: 1 })).toBe("1");
    expect(formatReportDowntime({ ...NO_DATA_SUMMARY, incidentCount: 1, downtimeMs: 30_000 })).toBe("30s");
    expect(formatReportOutageCount({ ...NO_DATA_SUMMARY, hasCompletedChecks: true, incompleteOutageHistory: true })).toBe("No data");
    expect(formatReportDowntime({ ...NO_DATA_SUMMARY, hasCompletedChecks: true, incompleteOutageHistory: true })).toBe("No data");
    expect(formatReportFailureRate(NO_DATA_SUMMARY)).toBe("No data");
    expect(formatReportP95Latency(NO_DATA_SUMMARY)).toBe("No data");
    expect(formatReportAverageLatency(NO_DATA_SUMMARY)).toBe("No data");
  });
});

describe("monitor breakdown metric formatting", () => {
  const noDataMonitor: GeneratedReport["monitorBreakdown"][number] = {
    monitorId: "monitor-1",
    name: "API",
    url: "https://example.com",
    companyName: null,
    status: "pending",
    pausedUntil: null,
    currentStatusCode: null,
    lastCheckedAt: null,
    lastFailureAt: null,
    lastErrorMessage: null,
    hasCompletedChecks: false,
    hasUptimeData: false,
    hasLatencySamples: false,
    uptimePct: 0,
    averageLatencyMs: 0,
    p95LatencyMs: 0,
    totalChecks: 0,
    upChecks: 0,
    downChecks: 0,
    pendingChecks: 0,
    incidentCount: 0,
    downtimeMs: 0,
    observedMs: 0,
  };

  it("does not present missing samples as perfect uptime or zero latency", () => {
    expect(formatMonitorUptime(noDataMonitor)).toBe("No data");
    expect(formatMonitorOutageCount(noDataMonitor)).toBe("No data");
    expect(formatMonitorDowntime(noDataMonitor)).toBe("No data");
    expect(formatMonitorOutageCount({ ...noDataMonitor, hasCompletedChecks: true, downChecks: 1 })).toBe("No data");
    expect(formatMonitorDowntime({ ...noDataMonitor, hasCompletedChecks: true, downChecks: 1 })).toBe("No data");
    expect(formatMonitorAverageLatency(noDataMonitor)).toBe("No data");
    expect(formatMonitorP95Latency(noDataMonitor)).toBe("No data");
  });
});
