import { AVAILABILITY_REFERENCE_PCT } from "@/lib/reports/analytics-insights";
import type { GeneratedReport } from "@/lib/reports/types";

type CheckSummary = {
  upChecks: number;
  downChecks: number;
  latencySamples: number;
  p95LatencyMs: number;
};

export function previousReportPeriod(period: { startedAt: Date; endedAt: Date; timeZone: string }) {
  const durationMs = period.endedAt.getTime() - period.startedAt.getTime();
  return {
    startedAt: new Date(period.startedAt.getTime() - durationMs),
    endedAt: period.startedAt,
    timeZone: period.timeZone,
  };
}

export function buildReportComparison(
  period: { startedAt: Date; endedAt: Date; timeZone: string },
  current: CheckSummary,
  previous: CheckSummary
) {
  const previousPeriod = previousReportPeriod(period);
  const completedChecks = current.upChecks + current.downChecks;
  const previousCompletedChecks = previous.upChecks + previous.downChecks;
  const currentUptimePct = completedChecks > 0 ? current.upChecks / completedChecks * 100 : null;
  const previousUptimePct = previousCompletedChecks > 0 ? previous.upChecks / previousCompletedChecks * 100 : null;
  const failureAllowancePct = 100 - AVAILABILITY_REFERENCE_PCT;
  const budgetUsedPct = completedChecks > 0
    ? (current.downChecks / completedChecks * 100) / failureAllowancePct * 100
    : null;

  return {
    previousPeriodStartedAt: previousPeriod.startedAt.toISOString(),
    previousPeriodEndedAt: previousPeriod.endedAt.toISOString(),
    previousCompletedChecks,
    previousUptimePct,
    uptimeChangePoints: currentUptimePct !== null && previousUptimePct !== null
      ? currentUptimePct - previousUptimePct : null,
    previousP95LatencyMs: previous.latencySamples > 0 ? previous.p95LatencyMs : null,
    p95LatencyChangeMs: current.latencySamples > 0 && previous.latencySamples > 0
      ? current.p95LatencyMs - previous.p95LatencyMs : null,
    referenceUptimePct: AVAILABILITY_REFERENCE_PCT,
    budgetUsedPct,
    budgetRemainingPct: budgetUsedPct === null ? null : Math.max(0, 100 - budgetUsedPct),
  };
}

export function formatReportComparison(comparison: NonNullable<GeneratedReport["comparison"]>) {
  const referenceLabel = `${comparison.referenceUptimePct}%`;
  const uptime = comparison.previousUptimePct === null
    ? "No prior checks"
    : `${comparison.previousUptimePct.toFixed(2)}% previously · ${comparison.uptimeChangePoints === null ? "No comparison" : `${comparison.uptimeChangePoints >= 0 ? "+" : ""}${comparison.uptimeChangePoints.toFixed(2)} pp`}`;
  const budget = comparison.budgetRemainingPct === null
    ? "No completed checks"
    : `${comparison.budgetRemainingPct.toFixed(1)}% remaining`;
  const budgetDetail = comparison.budgetUsedPct === null
    ? `Check-based ${referenceLabel} reference; no completed checks`
    : `${comparison.budgetUsedPct.toFixed(1)}% of the allowed failed-check share used · check-based ${referenceLabel} reference, not an SLA`;
  const latency = comparison.previousP95LatencyMs === null
    ? "No prior latency samples"
    : `${comparison.previousP95LatencyMs}ms previously · ${comparison.p95LatencyChangeMs === null ? "No comparison" : `${comparison.p95LatencyChangeMs >= 0 ? "+" : ""}${comparison.p95LatencyChangeMs}ms`}`;
  return { uptime, latency, budget, budgetDetail, referenceLabel };
}
