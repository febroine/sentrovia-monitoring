import type { Monitor } from "@/lib/db/schema";
import { intervalToMs } from "@/lib/monitors/utils";
import type { CheckResult } from "@/worker/types";

export async function checkHeartbeatMonitor(monitor: Monitor): Promise<CheckResult> {
  const checkedAt = new Date();
  const lastHeartbeatAt = monitor.heartbeatLastReceivedAt;
  const expectedWindowMs = intervalToMs(monitor.intervalValue, monitor.intervalUnit);

  if (!lastHeartbeatAt) {
    return buildHeartbeatFailure(
      checkedAt,
      "No heartbeat has been received for this cron monitor yet."
    );
  }

  const ageMs = checkedAt.getTime() - lastHeartbeatAt.getTime();
  if (ageMs > expectedWindowMs) {
    return buildHeartbeatFailure(
      checkedAt,
      `Heartbeat is overdue by ${Math.ceil((ageMs - expectedWindowMs) / 1000)}s.`
    );
  }

  return {
    ok: true,
    status: "up",
    statusCode: 200,
    latencyMs: Math.max(1, Math.round(ageMs / 1000)),
    errorMessage: null,
    checkedAt,
    sslExpiresAt: null,
  };
}

function buildHeartbeatFailure(checkedAt: Date, errorMessage: string): CheckResult {
  return {
    ok: false,
    status: "down",
    statusCode: 408,
    latencyMs: null,
    errorMessage,
    checkedAt,
    sslExpiresAt: null,
  };
}
