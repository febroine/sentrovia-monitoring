import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitorChecks } from "@/lib/db/schema";

const DAY_MS = 24 * 60 * 60_000;

export interface SlaPeriodSummary {
  label: "24h SLA" | "7d SLA";
  uptimePct: number;
  incidents: number;
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
  const [counts] = await db
    .select({
      total24Hours: sql<number>`count(*) filter (where ${monitorChecks.createdAt} >= ${since24Hours} and ${monitorChecks.status} <> 'pending')::int`,
      up24Hours: sql<number>`count(*) filter (where ${monitorChecks.createdAt} >= ${since24Hours} and ${monitorChecks.status} = 'up')::int`,
      down24Hours: sql<number>`count(*) filter (where ${monitorChecks.createdAt} >= ${since24Hours} and ${monitorChecks.status} = 'down')::int`,
      total7Days: sql<number>`count(*) filter (where ${monitorChecks.status} <> 'pending')::int`,
      up7Days: sql<number>`count(*) filter (where ${monitorChecks.status} = 'up')::int`,
      down7Days: sql<number>`count(*) filter (where ${monitorChecks.status} = 'down')::int`,
    })
    .from(monitorChecks)
    .where(
      and(
        eq(monitorChecks.userId, userId),
        inArray(monitorChecks.monitorId, Array.from(new Set(monitorIds))),
        gte(monitorChecks.createdAt, since7Days)
      )
    );

  return [
    calculateSlaPeriod(
      "24h SLA",
      counts?.up24Hours ?? 0,
      counts?.down24Hours ?? 0,
      counts?.total24Hours ?? 0
    ),
    calculateSlaPeriod(
      "7d SLA",
      counts?.up7Days ?? 0,
      counts?.down7Days ?? 0,
      counts?.total7Days ?? 0
    ),
  ];
}

export function calculateSlaPeriod(
  label: SlaPeriodSummary["label"],
  upChecks: number,
  downChecks: number,
  totalChecks: number
): SlaPeriodSummary {
  const normalizedTotal = Math.max(0, totalChecks);
  const normalizedUp = Math.min(normalizedTotal, Math.max(0, upChecks));

  return {
    label,
    uptimePct: normalizedTotal > 0 ? (normalizedUp / normalizedTotal) * 100 : 100,
    incidents: Math.min(normalizedTotal, Math.max(0, downChecks)),
    totalChecks: normalizedTotal,
  };
}

function emptyPeriod(label: SlaPeriodSummary["label"]): SlaPeriodSummary {
  return calculateSlaPeriod(label, 0, 0, 0);
}
