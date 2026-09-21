import { intervalToMs } from "@/lib/monitors/interval";

const MIN_CHECK_GRACE_MS = 60_000;

export function getCheckScheduleIssue(monitor: {
  monitorType: string;
  isActive: boolean;
  pausedUntil: string | null;
  nextCheckAt: string | null;
  intervalValue: number;
  intervalUnit: string;
  timeout: number;
}, now = new Date()): "missing" | "overdue" | null {
  if (!monitor.isActive || monitor.monitorType === "heartbeat") return null;
  if (monitor.pausedUntil && new Date(monitor.pausedUntil) > now) return null;
  if (!monitor.nextCheckAt) return "missing";

  const dueAt = new Date(monitor.nextCheckAt).getTime();
  const intervalMs = intervalToMs(monitor.intervalValue, monitor.intervalUnit);
  if (!Number.isFinite(dueAt) || !Number.isFinite(intervalMs) || intervalMs <= 0) return "missing";

  const graceMs = Math.max(MIN_CHECK_GRACE_MS, intervalMs, monitor.timeout);
  return now.getTime() > dueAt + graceMs ? "overdue" : null;
}

export type ReportCheckCoverage = {
  actualChecks: number;
  expectedChecks: number;
  eligibleMonitors: number;
  excludedMonitors: number;
};

export function estimateReportCheckCoverage(
  period: { startedAt: Date; endedAt: Date },
  generatedAt: Date,
  monitors: Array<{
    id: string;
    monitorType: string;
    createdAt: Date;
    lastCheckedAt?: Date | null;
    nextCheckAt?: Date | null;
    pausedUntil: Date | null;
    intervalValue: number;
    intervalUnit: string;
  }>,
  actualByMonitorId: Map<string, { totalChecks: number; pendingChecks: number }>
): ReportCheckCoverage {
  const coverage = { actualChecks: 0, expectedChecks: 0, eligibleMonitors: 0, excludedMonitors: 0 };
  const endedAt = Math.min(period.endedAt.getTime(), generatedAt.getTime());

  for (const monitor of monitors) {
    const intervalMs = intervalToMs(monitor.intervalValue, monitor.intervalUnit);
    const firstScheduledAt = monitor.lastCheckedAt === null
      ? monitor.nextCheckAt?.getTime() ?? Number.NaN
      : monitor.createdAt.getTime();
    const startedAt = Math.max(period.startedAt.getTime(), monitor.createdAt.getTime(), firstScheduledAt);
    if (
      monitor.monitorType === "heartbeat"
      || (monitor.pausedUntil && monitor.pausedUntil.getTime() > period.startedAt.getTime())
      || !Number.isFinite(intervalMs) || intervalMs <= 0
      || !Number.isFinite(startedAt) || startedAt >= endedAt
    ) {
      coverage.excludedMonitors++;
      continue;
    }

    coverage.eligibleMonitors++;
    coverage.expectedChecks += Math.max(1, Math.floor((endedAt - startedAt) / intervalMs));
    const actual = actualByMonitorId.get(monitor.id);
    coverage.actualChecks += (actual?.totalChecks ?? 0) + (actual?.pendingChecks ?? 0);
  }

  return coverage;
}

export function formatReportCheckCoverage(coverage: ReportCheckCoverage) {
  if (coverage.eligibleMonitors === 0) {
    return {
      value: coverage.excludedMonitors === 0 ? "No monitors in scope" : "Estimate unavailable",
      detail: coverage.excludedMonitors === 0
        ? "No scheduled checks to estimate"
        : `${coverage.excludedMonitors} monitors excluded from the estimate`,
    };
  }

  return {
    value: `${coverage.actualChecks.toLocaleString("en-GB")} / ~${coverage.expectedChecks.toLocaleString("en-GB")} checks`,
    detail: `${coverage.eligibleMonitors} scheduled monitors · ${coverage.excludedMonitors} excluded · current-interval estimate (past changes may differ); uptime uses observed checks only`,
  };
}
