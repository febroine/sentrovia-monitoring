export type ReportOutage = {
  monitorId: string;
  startedAt: Date;
  resolvedAt: Date | null;
};

export type OutageMetrics = {
  incidentCount: number;
  downtimeMs: number;
};

export function summarizeOutages(
  outages: ReportOutage[],
  startedAt: Date,
  endedAt: Date
): Map<string, OutageMetrics> {
  const intervals = new Map<string, Array<[number, number]>>();
  const counts = new Map<string, number>();
  const start = startedAt.getTime();
  const end = endedAt.getTime();
  if (end <= start) return new Map();

  for (const outage of outages) {
    if (outage.startedAt.getTime() >= end || (outage.resolvedAt && outage.resolvedAt.getTime() <= start)) continue;
    const clippedStart = Math.max(start, outage.startedAt.getTime());
    const clippedEnd = Math.min(end, outage.resolvedAt?.getTime() ?? end);
    counts.set(outage.monitorId, (counts.get(outage.monitorId) ?? 0) + 1);
    if (clippedEnd <= clippedStart) continue;
    const monitorIntervals = intervals.get(outage.monitorId) ?? [];
    monitorIntervals.push([clippedStart, clippedEnd]);
    intervals.set(outage.monitorId, monitorIntervals);
  }

  const result = new Map<string, OutageMetrics>(
    Array.from(counts, ([monitorId, incidentCount]) => [monitorId, { incidentCount, downtimeMs: 0 }])
  );
  for (const [monitorId, monitorIntervals] of intervals) {
    monitorIntervals.sort((left, right) => left[0] - right[0]);
    let downtimeMs = 0;
    let [currentStart, currentEnd] = monitorIntervals[0];
    for (const [nextStart, nextEnd] of monitorIntervals.slice(1)) {
      if (nextStart <= currentEnd) {
        currentEnd = Math.max(currentEnd, nextEnd);
      } else {
        downtimeMs += currentEnd - currentStart;
        [currentStart, currentEnd] = [nextStart, nextEnd];
      }
    }
    downtimeMs += currentEnd - currentStart;
    result.set(monitorId, { incidentCount: counts.get(monitorId) ?? 0, downtimeMs });
  }
  return result;
}

export function calculateTimeUptimePct(observedMs: number, downtimeMs: number) {
  if (observedMs <= 0) return 0;
  return Math.round((1 - Math.max(0, Math.min(downtimeMs, observedMs)) / observedMs) * 10_000) / 100;
}

export function calculateMonitorReportDurationMs(startedAt: Date, endedAt: Date, monitorCreatedAt: Date) {
  return Math.max(0, endedAt.getTime() - Math.max(startedAt.getTime(), monitorCreatedAt.getTime()));
}
