export const MAX_MONITOR_PAUSE_MS = 365 * 24 * 60 * 60_000;

export type MonitorPauseUnit = "minutes" | "hours" | "days";

const PAUSE_UNIT_MS: Record<MonitorPauseUnit, number> = {
  minutes: 60_000,
  hours: 60 * 60_000,
  days: 24 * 60 * 60_000,
};

export function getMonitorPauseDurationMs(value: number, unit: MonitorPauseUnit) {
  return value * PAUSE_UNIT_MS[unit];
}

export function resolveMonitorPauseUntil(
  value: number,
  unit: MonitorPauseUnit,
  now = new Date()
) {
  const durationMs = getMonitorPauseDurationMs(value, unit);
  if (!Number.isSafeInteger(value) || value < 1 || !Number.isFinite(durationMs) || durationMs > MAX_MONITOR_PAUSE_MS) {
    throw new Error("Pause duration must be between 1 minute and 365 days.");
  }

  return new Date(now.getTime() + durationMs);
}

export function isMonitorTemporarilyPaused(
  pausedUntil: Date | string | null | undefined,
  now = new Date()
) {
  if (!pausedUntil) {
    return false;
  }

  const timestamp = pausedUntil instanceof Date ? pausedUntil.getTime() : Date.parse(pausedUntil);
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}
