import type { GeneratedReport } from "@/lib/reports/types";

type ReportSummary = GeneratedReport["summary"];
type MonitorBreakdown = GeneratedReport["monitorBreakdown"][number];

export function formatReportHealthScore(summary: ReportSummary) {
  return summary.hasUptimeData ? `${summary.healthScore}/100` : "No data";
}

export function formatReportUptime(summary: ReportSummary) {
  return summary.hasUptimeData ? `${summary.uptimePct.toFixed(2)}%` : "No data";
}

export function formatReportUptimeNote(summary: ReportSummary) {
  if (summary.incompleteOutageHistory) return "Outage history is incomplete for this period";
  return summary.hasUptimeData
    ? "From recorded outages; historical pauses may count as uptime"
    : "No completed checks or recorded outages in this period";
}

export function formatOutageDuration(durationMs: number) {
  if (durationMs <= 0) return "0s";
  const seconds = Math.round(durationMs / 1_000);
  if (seconds === 0) return "<1s";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, remainingSeconds && `${remainingSeconds}s`]
    .filter(Boolean)
    .join(" ");
}

export function formatReportOutageCount(summary: ReportSummary) {
  return !summary.incompleteOutageHistory && (summary.hasCompletedChecks || summary.incidentCount > 0)
    ? String(summary.incidentCount)
    : "No data";
}

export function formatReportDowntime(summary: ReportSummary) {
  return !summary.incompleteOutageHistory && (summary.hasCompletedChecks || summary.incidentCount > 0)
    ? formatOutageDuration(summary.downtimeMs)
    : "No data";
}

export function formatMonitorOutageCount(monitor: MonitorBreakdown) {
  return hasMonitorOutageData(monitor) ? String(monitor.incidentCount) : "No data";
}

export function formatMonitorDowntime(monitor: MonitorBreakdown) {
  return hasMonitorOutageData(monitor) ? formatOutageDuration(monitor.downtimeMs) : "No data";
}

function hasMonitorOutageData(monitor: MonitorBreakdown) {
  return (monitor.hasCompletedChecks || monitor.incidentCount > 0)
    && !(monitor.downChecks > 0 && monitor.incidentCount === 0);
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

export function formatMonitorUptime(monitor: MonitorBreakdown) {
  return monitor.hasUptimeData ? `${monitor.uptimePct.toFixed(2)}%` : "No data";
}

export function formatMonitorP95Latency(monitor: MonitorBreakdown) {
  return monitor.hasLatencySamples ? `${monitor.p95LatencyMs}ms` : "No data";
}

export function formatMonitorAverageLatency(monitor: MonitorBreakdown) {
  return monitor.hasLatencySamples ? `${monitor.averageLatencyMs}ms` : "No data";
}
