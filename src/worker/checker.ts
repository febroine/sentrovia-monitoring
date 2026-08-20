import type { Monitor } from "@/lib/db/schema";
import { intervalToMs } from "@/lib/monitors/utils";
import { checkHeartbeatMonitor } from "@/worker/check-heartbeat";
import { checkHttpMonitor } from "@/worker/check-http";
import { checkPingMonitor } from "@/worker/check-ping";
import { checkPortMonitor } from "@/worker/check-port";
import { checkPostgresMonitor } from "@/worker/check-postgres";
import type { CheckResult } from "@/worker/types";

const VERIFICATION_INTERVAL_MS = 60_000;
const HEARTBEAT_DEADLINE_OFFSET_MS = 1;

export async function checkMonitor(monitor: Monitor): Promise<CheckResult> {
  const checkedAt = new Date();

  try {
    if (monitor.monitorType === "port") {
      return await checkPortMonitor(monitor);
    }

    if (monitor.monitorType === "ping") {
      return await checkPingMonitor(monitor);
    }

    if (monitor.monitorType === "postgres") {
      return await checkPostgresMonitor(monitor);
    }

    if (monitor.monitorType === "heartbeat") {
      return await checkHeartbeatMonitor(monitor);
    }

    if (monitor.monitorType === "http" || monitor.monitorType === "keyword" || monitor.monitorType === "json") {
      return await checkHttpMonitor(monitor);
    }

    return buildConfigurationFailure(checkedAt, `Unsupported monitor type: ${monitor.monitorType}.`);
  } catch (error) {
    return buildConfigurationFailure(
      checkedAt,
      error instanceof Error ? error.message : "Monitor configuration could not be checked."
    );
  }
}

export function calculateNextCheckAt(monitor: Monitor, checkedAt: Date, completedAt = checkedAt) {
  if (monitor.monitorType === "heartbeat" && monitor.heartbeatLastReceivedAt) {
    const heartbeatDeadline = monitor.heartbeatLastReceivedAt.getTime()
      + intervalToMs(monitor.intervalValue, monitor.intervalUnit)
      + Math.max(0, monitor.timeout)
      + HEARTBEAT_DEADLINE_OFFSET_MS;

    return new Date(Math.max(heartbeatDeadline, completedAt.getTime()));
  }

  return new Date(Math.max(
    checkedAt.getTime() + intervalToMs(monitor.intervalValue, monitor.intervalUnit),
    completedAt.getTime()
  ));
}

export function calculateVerificationCheckAt(checkedAt: Date, completedAt = checkedAt) {
  return new Date(Math.max(checkedAt.getTime() + VERIFICATION_INTERVAL_MS, completedAt.getTime()));
}

function buildConfigurationFailure(checkedAt: Date, errorMessage: string): CheckResult {
  return {
    ok: false,
    status: "down",
    statusCode: null,
    latencyMs: Math.max(1, Date.now() - checkedAt.getTime()),
    errorMessage,
    failureReason: "configuration",
    checkedAt,
    sslExpiresAt: null,
  };
}
