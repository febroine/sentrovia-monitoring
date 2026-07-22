import type { SiteStatus } from "@/lib/monitors/types";
import { intervalToMs } from "@/lib/monitors/utils";

type MonitorHealthBand = "excellent" | "good" | "warning" | "critical";

interface MonitorHealthSummary {
  score: number;
  band: MonitorHealthBand;
  label: string;
}

type MonitorHealthInput = {
  status: SiteStatus;
  verificationMode: boolean;
  consecutiveFailures: number;
  latencyMs: number | null;
  uptime: string;
  isActive: boolean;
  lastCheckedAt?: Date | string | null;
  nextCheckAt?: Date | string | null;
  intervalValue?: number;
  intervalUnit?: string;
  timeout?: number;
  now?: Date;
};

const MAX_SCORE = 100;
const INACTIVE_SCORE = 100;
const DOWN_PENALTY = 48;
const VERIFYING_PENALTY = 18;
const FAILURE_PENALTY_STEP = 8;
const MAX_FAILURE_PENALTY = 24;
const STALE_CHECK_PENALTY = 12;

export function buildMonitorHealthSummary(input: MonitorHealthInput): MonitorHealthSummary {
  if (!input.isActive) {
    return { score: INACTIVE_SCORE, band: "good", label: "Paused" };
  }

  let score = MAX_SCORE;
  score -= resolveStatusPenalty(input.status, input.verificationMode);
  score -= Math.min(input.consecutiveFailures * FAILURE_PENALTY_STEP, MAX_FAILURE_PENALTY);
  score -= resolveLatencyPenalty(input.latencyMs);
  score -= resolveUptimePenalty(input.uptime);
  score -= isMonitorCheckStale(input) ? STALE_CHECK_PENALTY : 0;

  const boundedScore = Math.max(0, Math.min(MAX_SCORE, Math.round(score)));
  const band = resolveHealthBand(boundedScore);

  return {
    score: boundedScore,
    band,
    label: resolveHealthLabel(band),
  };
}

function resolveHealthBand(score: number): MonitorHealthBand {
  if (score >= 90) {
    return "excellent";
  }

  if (score >= 75) {
    return "good";
  }

  if (score >= 50) {
    return "warning";
  }

  return "critical";
}

function resolveStatusPenalty(status: SiteStatus, verificationMode: boolean) {
  if (status === "down") {
    return DOWN_PENALTY;
  }

  if (verificationMode || status === "pending") {
    return VERIFYING_PENALTY;
  }

  return 0;
}

function resolveLatencyPenalty(latencyMs: number | null) {
  if (typeof latencyMs !== "number" || latencyMs <= 0) {
    return 0;
  }

  if (latencyMs >= 2_500) {
    return 18;
  }

  if (latencyMs >= 1_500) {
    return 12;
  }

  if (latencyMs >= 800) {
    return 7;
  }

  if (latencyMs >= 400) {
    return 3;
  }

  return 0;
}

function resolveUptimePenalty(uptime: string) {
  const parsed = Number.parseFloat(uptime.replace("%", "").trim());
  if (Number.isNaN(parsed)) {
    return 0;
  }

  if (parsed < 95) {
    return 20;
  }

  if (parsed < 98) {
    return 12;
  }

  if (parsed < 99.5) {
    return 6;
  }

  return 0;
}

export function isMonitorCheckStale(input: Pick<
  MonitorHealthInput,
  "lastCheckedAt" | "nextCheckAt" | "intervalValue" | "intervalUnit" | "timeout" | "now"
>) {
  const now = input.now ?? new Date();
  const nextCheckAt = parseDate(input.nextCheckAt);
  const lastCheckedAt = parseDate(input.lastCheckedAt);
  const hasInterval = typeof input.intervalValue === "number" && Boolean(input.intervalUnit);

  if (hasInterval) {
    const intervalMs = intervalToMs(input.intervalValue!, input.intervalUnit!);
    const expectedAt = nextCheckAt
      ?? (lastCheckedAt ? new Date(lastCheckedAt.getTime() + intervalMs) : null);
    if (!expectedAt) {
      return true;
    }

    const timeoutMs = typeof input.timeout === "number" && Number.isFinite(input.timeout)
      ? Math.max(0, input.timeout)
      : 0;
    const graceMs = Math.max(intervalMs, timeoutMs, 60_000);
    return now.getTime() - expectedAt.getTime() > graceMs;
  }

  if (!lastCheckedAt) {
    return true;
  }

  return now.getTime() - lastCheckedAt.getTime() > 180 * 60_000;
}

function parseDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveHealthLabel(band: MonitorHealthBand) {
  if (band === "excellent") {
    return "Excellent";
  }

  if (band === "good") {
    return "Stable";
  }

  if (band === "warning") {
    return "Watch";
  }

  return "At Risk";
}
