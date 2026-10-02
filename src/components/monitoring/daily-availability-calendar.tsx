"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { DailyAvailability } from "@/lib/monitors/daily-availability";

type DayLevel = "none" | "partial" | "good" | "minor" | "major" | "critical";

const LEVELS: Record<DayLevel, { label: string; color: string | null }> = {
  good: { label: "No downtime", color: "#0ca30c" },
  minor: { label: "99% or more", color: "#fab219" },
  major: { label: "95% to 99%", color: "#ec835a" },
  critical: { label: "Below 95%", color: "#d03b3b" },
  partial: { label: "Incomplete history", color: null },
  none: { label: "No data", color: null },
};

const LEGEND_ORDER: DayLevel[] = ["good", "minor", "major", "critical", "none"];
const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; timeZone: string; days: DailyAvailability[] };

// The monitor's availability for each of the last 90 days, one cell per day, weeks as columns. Render it
// with `key={monitorId}` so another monitor starts from a fresh loading state.
export function DailyAvailabilityCalendar({ monitorId }: { monitorId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [activeDate, setActiveDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch(`/api/monitors/${encodeURIComponent(monitorId)}/daily-availability`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok || !Array.isArray(body?.days)) {
          setState({ status: "error", message: body?.message ?? "Daily availability could not be loaded." });
          return;
        }
        setState({ status: "ready", timeZone: String(body.timeZone), days: body.days });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", message: "Daily availability could not be loaded." });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [monitorId]);

  const days = useMemo(() => (state.status === "ready" ? state.days : []), [state]);
  const layout = useMemo(() => buildCalendarLayout(days), [days]);
  const summary = useMemo(() => summarizeDays(days), [days]);
  const activeDay = days.find((day) => day.date === activeDate) ?? null;
  const focusDate = activeDate ?? days[days.length - 1]?.date ?? null;

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
    let target: number | null = null;
    const current = days.findIndex((day) => day.date === focusDate);
    if (event.key in steps && current >= 0) target = current + steps[event.key];
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = days.length - 1;
    if (target === null) return;
    event.preventDefault();
    const next = days[Math.max(0, Math.min(days.length - 1, target))];
    setActiveDate(next.date);
    event.currentTarget.querySelector<HTMLElement>(`[data-date="${next.date}"]`)?.focus();
  }

  return (
    <section className="rounded-md bg-muted/20 p-4" aria-labelledby={`daily-availability-${monitorId}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p id={`daily-availability-${monitorId}`} className="text-sm font-medium">Last 90 days</p>
        {state.status === "ready" ? (
          <p className="text-xs text-muted-foreground">
            {summary.uptimePct === null ? "No completed checks yet" : `${formatUptime(summary.uptimePct)} uptime`}
            {summary.downDays > 0 ? ` · ${summary.downDays} ${summary.downDays === 1 ? "day" : "days"} with downtime` : ""}
            {` · days in ${state.timeZone}`}
          </p>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <div className="mt-3 h-[132px] animate-pulse rounded-md bg-muted/40" aria-label="Loading daily availability" />
      ) : state.status === "error" ? (
        <p className="mt-3 text-xs text-muted-foreground">{state.message}</p>
      ) : (
        <>
          <div className="mt-3 flex gap-1.5">
            <div className="grid shrink-0 grid-rows-[auto_repeat(7,minmax(0,1fr))] gap-[3px] text-[10px] leading-none text-muted-foreground" aria-hidden="true">
              <span className="h-3" />
              {WEEKDAY_LABELS.map((label, index) => (
                <span key={index} className="flex items-center">{label}</span>
              ))}
            </div>
            <div className="min-w-0 max-w-[24rem] flex-1">
              <div
                className="grid gap-[3px]"
                style={{ gridTemplateColumns: `repeat(${layout.weeks.length}, minmax(0, 1fr))` }}
              >
                {layout.weeks.map((week, index) => (
                  <span key={index} className="h-3 overflow-visible whitespace-nowrap text-[10px] leading-none text-muted-foreground" aria-hidden="true">
                    {week.monthLabel}
                  </span>
                ))}
              </div>
              <div
                role="grid"
                aria-label="Daily availability, last 90 days. Use the arrow keys to move between days."
                className="mt-[3px] grid grid-flow-col grid-rows-7 gap-[3px]"
                style={{ gridTemplateColumns: `repeat(${layout.weeks.length}, minmax(0, 1fr))` }}
                onKeyDown={moveFocus}
                onMouseLeave={() => setActiveDate(null)}
              >
                {layout.cells.map((day, index) => {
                  if (!day) return <span key={`blank-${index}`} aria-hidden="true" />;
                  const level = dayLevel(day);
                  const color = LEVELS[level].color;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      role="gridcell"
                      data-date={day.date}
                      tabIndex={day.date === focusDate ? 0 : -1}
                      aria-label={describeDay(day)}
                      aria-selected={day.date === activeDate}
                      className={[
                        "aspect-square w-full rounded-[3px] outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                        color ? "" : level === "partial" ? "border border-dashed border-muted-foreground/60 bg-muted/40" : "border border-border bg-muted/30",
                        day.date === activeDate ? "scale-110" : "",
                      ].join(" ")}
                      style={color ? { backgroundColor: color } : undefined}
                      onMouseEnter={() => setActiveDate(day.date)}
                      onFocus={() => setActiveDate(day.date)}
                      onClick={() => setActiveDate(day.date)}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          <p className="mt-3 min-h-[2.5rem] text-xs text-muted-foreground sm:min-h-[1.25rem]" aria-live="polite">
            {activeDay ? describeDay(activeDay) : "Point at or tap a day to see its availability."}
          </p>

          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-label="Legend">
            {LEGEND_ORDER.concat(days.some((day) => day.incompleteHistory) ? ["partial"] : []).map((level) => (
              <li key={level} className="flex items-center gap-1.5">
                <span
                  className={[
                    "size-2.5 rounded-[2px]",
                    LEVELS[level].color ? "" : level === "partial" ? "border border-dashed border-muted-foreground/60 bg-muted/40" : "border border-border bg-muted/30",
                  ].join(" ")}
                  style={LEVELS[level].color ? { backgroundColor: LEVELS[level].color! } : undefined}
                  aria-hidden="true"
                />
                {LEVELS[level].label}
              </li>
            ))}
          </ul>

          {summary.downDays > 0 ? (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer font-medium text-foreground">Days with downtime ({summary.downDays})</summary>
              <table className="mt-2 w-full text-left">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Day</th>
                    <th className="py-1 pr-3 font-medium">Uptime</th>
                    <th className="py-1 pr-3 font-medium">Downtime</th>
                    <th className="py-1 font-medium">Incidents</th>
                  </tr>
                </thead>
                <tbody>
                  {[...days].reverse().filter((day) => day.hasData && day.downtimeMs > 0).map((day) => (
                    <tr key={day.date} className="border-t border-border/50">
                      <td className="py-1 pr-3">{formatDay(day.date)}</td>
                      <td className="py-1 pr-3 tabular-nums">{formatUptime(day.uptimePct)}</td>
                      <td className="py-1 pr-3 tabular-nums">{formatDowntime(day.downtimeMs)}</td>
                      <td className="py-1 tabular-nums">{day.incidentCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

export function dayLevel(day: DailyAvailability): DayLevel {
  if (day.incompleteHistory) return "partial";
  if (!day.hasData) return "none";
  if (day.downtimeMs <= 0) return "good";
  if (day.uptimePct >= 99) return "minor";
  if (day.uptimePct >= 95) return "major";
  return "critical";
}

// Lays the days out Monday-first, one column per week; blanks pad the first and last weeks.
export function buildCalendarLayout(days: DailyAvailability[]) {
  if (days.length === 0) return { cells: [] as Array<DailyAvailability | null>, weeks: [] as Array<{ monthLabel: string }> };
  const leading = (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells: Array<DailyAvailability | null> = [...Array<null>(leading).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<{ monthLabel: string }> = [];
  let previousMonth = "";
  for (let start = 0; start < cells.length; start += 7) {
    const firstDay = cells.slice(start, start + 7).find((cell): cell is DailyAvailability => cell !== null);
    const month = firstDay?.date.slice(0, 7) ?? "";
    // A month is named above the first week that starts in it.
    weeks.push({ monthLabel: firstDay && month !== previousMonth ? formatMonth(firstDay.date) : "" });
    previousMonth = month;
  }
  return { cells, weeks };
}

export function summarizeDays(days: DailyAvailability[]) {
  let observedMs = 0;
  let downtimeMs = 0;
  let downDays = 0;
  for (const day of days) {
    if (!day.hasData) continue;
    observedMs += day.observedMs;
    downtimeMs += day.downtimeMs;
    if (day.downtimeMs > 0) downDays += 1;
  }
  return {
    uptimePct: observedMs > 0 ? Math.max(0, 100 - (downtimeMs / observedMs) * 100) : null,
    downDays,
  };
}

function describeDay(day: DailyAvailability) {
  const date = formatDay(day.date);
  if (day.incompleteHistory) return `${date}: failed checks without a recorded outage, so availability is unknown`;
  if (!day.hasData) return `${date}: no data`;
  const checks = `${day.completedChecks.toLocaleString("en-GB")} ${day.completedChecks === 1 ? "check" : "checks"}`;
  if (day.downtimeMs <= 0) return `${date}: ${formatUptime(day.uptimePct)} uptime, no downtime, ${checks}`;
  const incidents = `${day.incidentCount} ${day.incidentCount === 1 ? "incident" : "incidents"}`;
  return `${date}: ${formatUptime(day.uptimePct)} uptime, ${formatDowntime(day.downtimeMs)} down, ${incidents}, ${checks}`;
}

function formatUptime(value: number) {
  // Never round a day with downtime up to 100%.
  const rounded = Math.floor(value * 100) / 100;
  return `${rounded.toFixed(value >= 100 ? 0 : 2)}%`;
}

function formatDowntime(ms: number) {
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 1) return `${Math.max(1, Math.round(ms / 1000))}s`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatDay(key: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${key}T00:00:00Z`));
}

function formatMonth(key: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(`${key}T00:00:00Z`));
}
