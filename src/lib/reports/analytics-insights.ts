import type { GeneratedReport } from "@/lib/reports/types";

export const AVAILABILITY_REFERENCE_PCT = 99.9;

export function getExecutiveInsights(report: GeneratedReport) {
  const observedDays = report.dailyMetrics.filter((day) => day.upChecks + day.downChecks > 0);
  const daysAtReference = observedDays.filter((day) => day.uptimePct >= AVAILABILITY_REFERENCE_PCT).length;
  const belowReference = report.monitorBreakdown.filter(
    (monitor) => monitor.hasUptimeData && monitor.uptimePct < AVAILABILITY_REFERENCE_PCT
  ).length;
  const missingData = report.monitorBreakdown.filter((monitor) => !monitor.hasUptimeData).length;
  const leadingOutage = report.monitorBreakdown.reduce<GeneratedReport["monitorBreakdown"][number] | null>(
    (leading, monitor) => monitor.incidentCount > (leading?.incidentCount ?? 0) ? monitor : leading,
    null
  );

  return {
    observedDays: observedDays.length,
    daysAtReference,
    belowReference,
    missingData,
    leadingOutage: leadingOutage && leadingOutage.incidentCount > 0 ? {
      name: leadingOutage.name,
      incidentCount: leadingOutage.incidentCount,
    } : null,
  };
}

export function getMonitorRiskPoints(report: GeneratedReport) {
  const monitors = report.monitorBreakdown.filter((monitor) => monitor.hasUptimeData && monitor.hasLatencySamples);
  const sortedLatencies = monitors.map((monitor) => monitor.p95LatencyMs).sort((left, right) => left - right);
  const middle = Math.floor(sortedLatencies.length / 2);
  const medianLatencyMs = sortedLatencies.length === 0 ? null : sortedLatencies.length % 2 === 0
    ? (sortedLatencies[middle - 1] + sortedLatencies[middle]) / 2
    : sortedLatencies[middle];

  return { monitors, medianLatencyMs };
}
