export function getHeartbeatAgeMs(
  heartbeatAt: Date | null | undefined,
  now: Date
) {
  return heartbeatAt ? Math.max(0, now.getTime() - heartbeatAt.getTime()) : null;
}

export function isHeartbeatCurrent(
  heartbeatAt: Date | null | undefined,
  now: Date,
  staleThresholdMs: number
) {
  if (!heartbeatAt || !Number.isFinite(staleThresholdMs) || staleThresholdMs < 0) {
    return false;
  }

  return Math.abs(now.getTime() - heartbeatAt.getTime()) <= staleThresholdMs;
}
