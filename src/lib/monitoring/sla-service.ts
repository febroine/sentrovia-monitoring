import { loadAvailabilityForWindows, type AvailabilityResult } from "@/lib/outages/availability-service";

const DAY_MS = 24 * 60 * 60_000;

export interface SlaPeriodSummary {
  label: "24h SLA" | "7d SLA";
  hasData: boolean;
  uptimePct: number;
  outages: number;
  totalChecks: number;
}

export async function getMonitorSlaPeriods(
  userId: string,
  monitorIds: string[],
  now = new Date(),
  workspaceId?: string
): Promise<[SlaPeriodSummary, SlaPeriodSummary]> {
  if (monitorIds.length === 0) {
    return [emptyPeriod("24h SLA"), emptyPeriod("7d SLA")];
  }

  const periods = await loadAvailabilityForWindows(userId, monitorIds, [
    { key: "24h", startedAt: new Date(now.getTime() - DAY_MS), endedAt: now },
    { key: "7d", startedAt: new Date(now.getTime() - 7 * DAY_MS), endedAt: now },
  ], undefined, workspaceId);
  return [
    calculateSlaPeriod("24h SLA", periods.get("24h")),
    calculateSlaPeriod("7d SLA", periods.get("7d")),
  ];
}

export function calculateSlaPeriod(
  label: SlaPeriodSummary["label"],
  availability?: Pick<AvailabilityResult, "hasData" | "uptimePct" | "incidentCount" | "completedChecks">
): SlaPeriodSummary {
  return {
    label,
    hasData: availability?.hasData ?? false,
    uptimePct: availability?.hasData ? availability.uptimePct : 0,
    outages: availability?.incidentCount ?? 0,
    totalChecks: availability?.completedChecks ?? 0,
  };
}

function emptyPeriod(label: SlaPeriodSummary["label"]): SlaPeriodSummary {
  return calculateSlaPeriod(label);
}
