import type { IntervalUnit } from "@/lib/monitors/types";

/**
 * Formats a runtime millisecond value for humans without changing the value
 * persisted on a monitor or passed to a checker.
 */
export function formatDurationMs(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "not set";
  }

  const milliseconds = Math.max(0, Math.round(value));
  if (milliseconds < 1_000) {
    return `${milliseconds} milliseconds`;
  }

  const seconds = milliseconds / 1_000;
  if (seconds < 60) {
    return formatDurationQuantity(seconds, "second");
  }

  const minutes = seconds / 60;
  if (minutes < 60) {
    return formatDurationQuantity(minutes, "minute");
  }

  return formatDurationQuantity(minutes / 60, "hour");
}

/**
 * The form displays timeout values in seconds while the payload keeps the
 * worker's millisecond representation. A decimal step keeps sub-second
 * precision available for existing values without exposing raw milliseconds.
 */
export function formatDurationInputMs(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }

  const seconds = Math.max(0, value) / 1_000;
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export function parseDurationInputSeconds(value: string, fallbackMs: number) {
  const parsedSeconds = Number(value);
  return Number.isFinite(parsedSeconds) && parsedSeconds > 0 ? Math.round(parsedSeconds * 1_000) : fallbackMs;
}

export function buildOutageConfirmationSummary(
  intervalValue: number,
  intervalUnit: IntervalUnit,
  timeoutMs: number,
  retries: number
) {
  const threshold = Math.max(2, Math.round(retries));
  const verificationAttempts = threshold - 1;
  const verificationWindow = verificationAttempts * 60_000;
  const intervalLabel = formatIntervalDuration(intervalValue, intervalUnit);

  return `An outage is confirmed after ${threshold} consecutive failed probes: the initial failure plus ${verificationAttempts} verification ${verificationAttempts === 1 ? "attempt" : "attempts"} scheduled about one minute apart (roughly ${formatDurationMs(verificationWindow)}). Sentrovia then runs one final immediate confirmation probe before announcing the outage. Each probe can run for up to ${formatDurationMs(timeoutMs)}. Regular checks run every ${intervalLabel}.`;
}

function formatDurationQuantity(value: number, unit: "second" | "minute" | "hour") {
  const normalized = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
  return `${normalized} ${unit}${value === 1 ? "" : "s"}`;
}

function formatIntervalDuration(value: number, unit: IntervalUnit) {
  const amount = Math.max(1, Math.round(value));
  const unitLabel = unit === "sn" ? "second" : unit === "sa" ? "hour" : "minute";
  return `${amount} ${unitLabel}${amount === 1 ? "" : "s"}`;
}
