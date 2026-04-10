import type { Monitor } from "@/lib/db/schema";
import { intervalToMs } from "@/lib/monitors/utils";
import { checkHeartbeatMonitor } from "@/worker/check-heartbeat";
import { checkHttpMonitor } from "@/worker/check-http";
import { checkPingMonitor } from "@/worker/check-ping";
import { checkPortMonitor } from "@/worker/check-port";
import { checkPostgresMonitor } from "@/worker/check-postgres";
import type { CheckResult } from "@/worker/types";

const VERIFICATION_INTERVAL_MS = 60_000;

export async function checkMonitor(monitor: Monitor): Promise<CheckResult> {
  if (monitor.monitorType === "port") {
    return checkPortMonitor(monitor);
  }

  if (monitor.monitorType === "ping") {
    return checkPingMonitor(monitor);
  }

  if (monitor.monitorType === "postgres") {
    return checkPostgresMonitor(monitor);
  }

  if (monitor.monitorType === "heartbeat") {
    return checkHeartbeatMonitor(monitor);
  }

  return checkHttpMonitor(monitor);
}

export function calculateNextCheckAt(monitor: Monitor, checkedAt: Date) {
  return new Date(checkedAt.getTime() + intervalToMs(monitor.intervalValue, monitor.intervalUnit));
}

export function calculateVerificationCheckAt(checkedAt: Date) {
  return new Date(checkedAt.getTime() + VERIFICATION_INTERVAL_MS);
}
