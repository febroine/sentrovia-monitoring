import type { GeneratedReport } from "@/lib/reports/types";

type ReportSummary = GeneratedReport["summary"];

export function formatReportHealthScore(summary: ReportSummary) {
  return summary.hasCompletedChecks ? `${summary.healthScore}/100` : "No data";
}

export function formatReportUptime(summary: ReportSummary) {
  return summary.hasCompletedChecks ? `${summary.uptimePct.toFixed(2)}%` : "No data";
}

export function formatReportFailureRate(summary: ReportSummary) {
  return summary.hasCompletedChecks ? `${summary.failureRatePct.toFixed(2)}%` : "No data";
}

export function formatReportP95Latency(summary: ReportSummary) {
  return summary.hasLatencySamples ? `${summary.p95LatencyMs}ms` : "No data";
}

export function formatReportAverageLatency(summary: ReportSummary) {
  return summary.hasLatencySamples ? `${summary.averageLatencyMs}ms` : "No data";
}
