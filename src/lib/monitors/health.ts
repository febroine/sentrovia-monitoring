import type { SiteStatus } from "@/lib/monitors/types";

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
  score -= resolveStaleCheckPenalty(input.lastCheckedAt);

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

function resolveStaleCheckPenalty(lastCheckedAt?: Date | string | null) {
  if (!lastCheckedAt) {
    return STALE_CHECK_PENALTY;
  }

  const parsed = lastCheckedAt instanceof Date ? lastCheckedAt : new Date(lastCheckedAt);
  if (Number.isNaN(parsed.getTime())) {
    return STALE_CHECK_PENALTY;
  }

  const ageMinutes = (Date.now() - parsed.getTime()) / 60_000;
  return ageMinutes > 180 ? STALE_CHECK_PENALTY : 0;
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
