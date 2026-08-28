import type { GeneratedReport } from "@/lib/reports/types";

export function buildReportSnapshotRows(report: GeneratedReport) {
  const scopeLabel = report.scope === "company" ? report.companyName ?? "Company" : "Workspace";
  const topFailingUrl = report.failingMonitors[0]?.url ?? "No failing URL in this period";
  const slowestUrl = report.slowMonitors[0]
    ? `${report.slowMonitors[0].url} (${report.slowMonitors[0].averageLatencyMs}ms avg)`
    : "No latency data in this period";

  return [
    ["Reporting window", report.periodLabel],
    ["Generated", new Date(report.generatedAt).toLocaleString()],
    ["Scope", scopeLabel],
    ["Current state", formatCurrentState(report)],
    ["Most affected URL", topFailingUrl],
    ["Slowest URL", slowestUrl],
  ];
}

function formatCurrentState(report: GeneratedReport) {
  return `${report.summary.currentlyUp} up, ${report.summary.currentlyDown} down, ${report.summary.currentlyPending} pending`;
}
