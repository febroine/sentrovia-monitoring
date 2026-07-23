import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitorChecks, monitorOutages } from "@/lib/db/schema";

const DAY_MS = 24 * 60 * 60_000;

export interface SlaPeriodSummary {
  label: "24h SLA" | "7d SLA";
  uptimePct: number;
  outages: number;
  totalChecks: number;
}

export async function getMonitorSlaPeriods(
  userId: string,
  monitorIds: string[],
  now = new Date()
): Promise<[SlaPeriodSummary, SlaPeriodSummary]> {
  if (monitorIds.length === 0) {
    return [emptyPeriod("24h SLA"), emptyPeriod("7d SLA")];
  }

  const since24Hours = new Date(now.getTime() - DAY_MS);
  const since7Days = new Date(now.getTime() - 7 * DAY_MS);
  const uniqueMonitorIds = Array.from(new Set(monitorIds));
  const [[counts], outageCounts] = await Promise.all([
    db
      .select({
        total24Hours: sql<number>`count(*) filter (where ${monitorChecks.createdAt} >= ${since24Hours} and ${monitorChecks.status} <> 'pending')::int`,
        up24Hours: sql<number>`count(*) filter (where ${monitorChecks.createdAt} >= ${since24Hours} and ${monitorChecks.status} = 'up')::int`,
        total7Days: sql<number>`count(*) filter (where ${monitorChecks.status} <> 'pending')::int`,
        up7Days: sql<number>`count(*) filter (where ${monitorChecks.status} = 'up')::int`,
      })
      .from(monitorChecks)
      .where(
        and(
          eq(monitorChecks.userId, userId),
          inArray(monitorChecks.monitorId, uniqueMonitorIds),
          gte(monitorChecks.createdAt, since7Days)
        )
      ),
    getOutageCounts(userId, uniqueMonitorIds, since24Hours, since7Days),
  ]);

  return [
    calculateSlaPeriod(
      "24h SLA",
      counts?.up24Hours ?? 0,
      outageCounts?.total24Hours ?? 0,
      counts?.total24Hours ?? 0
    ),
    calculateSlaPeriod(
      "7d SLA",
      counts?.up7Days ?? 0,
      outageCounts?.total7Days ?? 0,
      counts?.total7Days ?? 0
    ),
  ];
}

async function getOutageCounts(
  userId: string,
  monitorIds: string[],
  since24Hours: Date,
  since7Days: Date
) {
  const request = db
      .select({
        total24Hours: sql<number>`count(*) filter (where ${monitorOutages.startedAt} >= ${since24Hours})::int`,
        total7Days: sql<number>`count(*)::int`,
      })
      .from(monitorOutages)
      .where(
        and(
          eq(monitorOutages.userId, userId),
          inArray(monitorOutages.monitorId, monitorIds),
          gte(monitorOutages.startedAt, since7Days)
        )
      );

  return loadOutageCountsOrFallback(request);
}

export async function loadOutageCountsOrFallback(
  request: Promise<Array<{ total24Hours: number; total7Days: number }>>
) {
  try {
    const [counts] = await request;
    return counts ?? EMPTY_OUTAGE_COUNTS;
  } catch (error) {
    console.error(
      "[sentrovia] Outage counts unavailable; SLA uptime will use monitor check history.",
      error
    );

    return EMPTY_OUTAGE_COUNTS;
  }
}

export function calculateSlaPeriod(
  label: SlaPeriodSummary["label"],
  upChecks: number,
  outageCount: number,
  totalChecks: number
): SlaPeriodSummary {
  const normalizedTotal = Math.max(0, totalChecks);
  const normalizedUp = Math.min(normalizedTotal, Math.max(0, upChecks));

  return {
    label,
    uptimePct: normalizedTotal > 0 ? (normalizedUp / normalizedTotal) * 100 : 100,
    outages: Math.max(0, outageCount),
    totalChecks: normalizedTotal,
  };
}

function emptyPeriod(label: SlaPeriodSummary["label"]): SlaPeriodSummary {
  return calculateSlaPeriod(label, 0, 0, 0);
}

const EMPTY_OUTAGE_COUNTS = Object.freeze({
  total24Hours: 0,
  total7Days: 0,
});
