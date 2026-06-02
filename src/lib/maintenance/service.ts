import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { maintenanceWindows, type Monitor } from "@/lib/db/schema";
import type { MaintenanceWindowInput } from "@/lib/maintenance/schemas";

type MaintenanceWindowRow = typeof maintenanceWindows.$inferSelect;
export type MaintenanceWindowRecord = ReturnType<typeof serializeMaintenanceWindow>;

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function listMaintenanceWindows(userId: string) {
  const rows = await db
    .select()
    .from(maintenanceWindows)
    .where(eq(maintenanceWindows.userId, userId))
    .orderBy(desc(maintenanceWindows.startsAt));

  return rows.map(serializeMaintenanceWindow);
}

export async function createMaintenanceWindow(userId: string, input: MaintenanceWindowInput) {
  const [created] = await db
    .insert(maintenanceWindows)
    .values(toMaintenanceValues(userId, input))
    .returning();

  return serializeMaintenanceWindow(created);
}

export async function updateMaintenanceWindow(userId: string, id: string, input: MaintenanceWindowInput) {
  const [updated] = await db
    .update(maintenanceWindows)
    .set({
      ...toMaintenanceValues(userId, input),
      updatedAt: new Date(),
    })
    .where(and(eq(maintenanceWindows.id, id), eq(maintenanceWindows.userId, userId)))
    .returning();

  return updated ? serializeMaintenanceWindow(updated) : null;
}

export async function deleteMaintenanceWindow(userId: string, id: string) {
  const [deleted] = await db
    .delete(maintenanceWindows)
    .where(and(eq(maintenanceWindows.id, id), eq(maintenanceWindows.userId, userId)))
    .returning({ id: maintenanceWindows.id });

  return deleted ?? null;
}

export async function findActiveMaintenanceWindowForMonitor(monitor: Monitor, now = new Date()) {
  const rows = await db
    .select()
    .from(maintenanceWindows)
    .where(and(eq(maintenanceWindows.userId, monitor.userId), eq(maintenanceWindows.isActive, true)));

  return rows.find((window) => isMaintenanceWindowActiveForMonitor(window, monitor, now)) ?? null;
}

export function isMaintenanceWindowActiveForMonitor(
  window: MaintenanceWindowRow,
  monitor: Pick<Monitor, "id" | "companyId" | "tags">,
  now = new Date()
) {
  return isWindowTimeActive(window, now) && doesWindowMatchMonitor(window, monitor);
}

function toMaintenanceValues(userId: string, input: MaintenanceWindowInput) {
  return {
    userId,
    name: input.name,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    timezone: input.timezone,
    recurrence: input.recurrence,
    scope: input.scope,
    monitorIds: input.scope === "monitors" ? input.monitorIds : [],
    companyIds: input.scope === "companies" ? input.companyIds : [],
    tags: input.scope === "tags" ? normalizeTags(input.tags) : [],
    isActive: input.isActive,
    suppressNotifications: input.suppressNotifications,
    suppressChecks: input.suppressChecks,
    reason: input.reason,
  };
}

function serializeMaintenanceWindow(row: MaintenanceWindowRow) {
  return {
    id: row.id,
    name: row.name,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timezone: row.timezone,
    recurrence: row.recurrence,
    scope: row.scope,
    monitorIds: row.monitorIds,
    companyIds: row.companyIds,
    tags: row.tags,
    isActive: row.isActive,
    suppressNotifications: row.suppressNotifications,
    suppressChecks: row.suppressChecks,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isWindowTimeActive(window: MaintenanceWindowRow, now: Date) {
  if (window.recurrence === "daily") {
    return isRecurringWindowActive(window.startsAt, window.endsAt, now, window.timezone, MINUTES_PER_DAY);
  }

  if (window.recurrence === "weekly") {
    return isRecurringWindowActive(window.startsAt, window.endsAt, now, window.timezone, MINUTES_PER_WEEK);
  }

  return now >= window.startsAt && now <= window.endsAt;
}

function isRecurringWindowActive(
  startsAt: Date,
  endsAt: Date,
  now: Date,
  timezone: string,
  periodMinutes: number
) {
  const startMinute = minutesSincePeriodStart(startsAt, timezone, periodMinutes);
  const nowMinute = minutesSincePeriodStart(now, timezone, periodMinutes);
  const durationMinutes = Math.max(1, Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000));
  const elapsed = (nowMinute - startMinute + periodMinutes) % periodMinutes;

  return elapsed <= Math.min(durationMinutes, periodMinutes);
}

function minutesSincePeriodStart(value: Date, timezone: string, periodMinutes: number) {
  const parts = getZonedTimeParts(value, timezone);
  const dayOffset = periodMinutes === MINUTES_PER_WEEK ? parts.day * MINUTES_PER_DAY : 0;
  return dayOffset + parts.hour * 60 + parts.minute;
}

function getZonedTimeParts(value: Date, timezone: string) {
  const parts = getSafeZonedParts(value, timezone);
  const weekday = parts.weekday ?? WEEKDAYS[value.getUTCDay()];

  return {
    day: Math.max(0, WEEKDAYS.indexOf(weekday)),
    hour: Number(parts.hour ?? value.getUTCHours()),
    minute: Number(parts.minute ?? value.getUTCMinutes()),
  };
}

function getSafeZonedParts(value: Date, timezone: string) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    return Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]));
  } catch {
    return {
      weekday: WEEKDAYS[value.getUTCDay()],
      hour: String(value.getUTCHours()),
      minute: String(value.getUTCMinutes()),
    };
  }
}

function doesWindowMatchMonitor(window: MaintenanceWindowRow, monitor: Pick<Monitor, "id" | "companyId" | "tags">) {
  if (window.scope === "all") {
    return true;
  }

  if (window.scope === "monitors") {
    return window.monitorIds.includes(monitor.id);
  }

  if (window.scope === "companies") {
    return Boolean(monitor.companyId && window.companyIds.includes(monitor.companyId));
  }

  const monitorTags = new Set(normalizeTags(monitor.tags));
  return normalizeTags(window.tags).some((tag) => monitorTags.has(tag));
}

function normalizeTags(tags: string[]) {
  return tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
}
