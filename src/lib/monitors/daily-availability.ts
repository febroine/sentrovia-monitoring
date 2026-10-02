import { and, eq, gt, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitorChecks, monitorOutages, monitors } from "@/lib/db/schema";
import { summarizeAvailabilityWindow, type AvailabilityWindow } from "@/lib/outages/availability-service";

export const DAILY_AVAILABILITY_DAYS = 90;

export type DailyAvailability = {
  date: string;
  hasData: boolean;
  incompleteHistory: boolean;
  uptimePct: number;
  observedMs: number;
  downtimeMs: number;
  incidentCount: number;
  completedChecks: number;
};

// Availability of one monitor for each calendar day in the workspace time zone, oldest first; the
// last day is today up to now. Uses the same outage-time measure as the uptime shown everywhere else.
export async function loadMonitorDailyAvailability(
  workspaceId: string,
  monitorId: string,
  timeZone: string,
  now = new Date(),
  days = DAILY_AVAILABILITY_DAYS
): Promise<DailyAvailability[] | null> {
  const [monitor] = await db
    .select({ id: monitors.id, createdAt: monitors.createdAt })
    .from(monitors)
    .where(and(eq(monitors.id, monitorId), eq(monitors.workspaceId, workspaceId), isNull(monitors.deletedAt)))
    .limit(1);
  if (!monitor) return null;

  const windows = buildDailyWindows(now, timeZone, days);
  const startedAt = windows[0].startedAt;
  const dayKey = sql<string>`to_char(${monitorChecks.createdAt} at time zone ${timeZone}, 'YYYY-MM-DD')`;
  const [checkRows, outageRows] = await Promise.all([
    db
      .select({
        date: dayKey,
        completedChecks: sql<number>`count(*) filter (where ${monitorChecks.status} in ('up', 'down'))::int`,
        downChecks: sql<number>`count(*) filter (where ${monitorChecks.status} = 'down')::int`,
      })
      .from(monitorChecks)
      .where(and(
        eq(monitorChecks.monitorId, monitorId),
        eq(monitorChecks.workspaceId, workspaceId),
        gte(monitorChecks.createdAt, startedAt),
        lt(monitorChecks.createdAt, now)
      ))
      // By position: the time zone is a bound parameter, so a repeated expression would not match.
      .groupBy(sql`1`),
    db
      .select({ monitorId: monitorOutages.monitorId, startedAt: monitorOutages.startedAt, resolvedAt: monitorOutages.resolvedAt })
      .from(monitorOutages)
      .where(and(
        eq(monitorOutages.monitorId, monitorId),
        eq(monitorOutages.workspaceId, workspaceId),
        lt(monitorOutages.startedAt, now),
        or(isNull(monitorOutages.resolvedAt), gt(monitorOutages.resolvedAt, startedAt))
      )),
  ]);

  const countsByDay = new Map(checkRows.map((row) => [row.date, row]));
  return windows.map((window) => {
    const counts = countsByDay.get(window.key);
    const summary = summarizeAvailabilityWindow(
      [monitor],
      counts ? [{ monitorId, completedChecks: Number(counts.completedChecks), downChecks: Number(counts.downChecks) }] : [],
      outageRows,
      window
    ).monitors.get(monitorId);
    return {
      date: window.key,
      hasData: summary?.hasData ?? false,
      incompleteHistory: summary?.incompleteHistory ?? false,
      uptimePct: summary?.uptimePct ?? 0,
      observedMs: summary?.observedMs ?? 0,
      downtimeMs: summary?.downtimeMs ?? 0,
      incidentCount: summary?.incidentCount ?? 0,
      completedChecks: summary?.completedChecks ?? 0,
    };
  });
}

// One window per calendar day in the time zone, from local midnight to the next (23 or 25 hours on a
// daylight-saving change); the last one ends at `now`.
export function buildDailyWindows(now: Date, timeZone: string, days: number): AvailabilityWindow[] {
  const todayKey = formatDateKey(now, timeZone);
  const windows: AvailabilityWindow[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const key = shiftDateKey(todayKey, -offset);
    const startedAt = zonedMidnight(key, timeZone);
    const endedAt = offset === 0 ? now : zonedMidnight(shiftDateKey(key, 1), timeZone);
    windows.push({ key, startedAt, endedAt });
  }
  return windows;
}

export function formatDateKey(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDateKey(key: string, days: number) {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// The instant the given calendar day starts in the time zone.
export function zonedMidnight(key: string, timeZone: string) {
  const wallClock = Date.parse(`${key}T00:00:00.000Z`);
  let instant = wallClock - timeZoneOffsetMs(new Date(wallClock), timeZone);
  // A second pass settles days whose offset differs from the one at the wall-clock guess.
  instant = wallClock - timeZoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

function timeZoneOffsetMs(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  const asUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}
