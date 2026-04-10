import type { Monitor } from "@/lib/db/schema";
import { intervalToMs } from "@/lib/monitors/utils";
import { checkHttpMonitor } from "@/worker/check-http";
import { checkPortMonitor } from "@/worker/check-port";
import { checkPostgresMonitor } from "@/worker/check-postgres";
import type { CheckResult } from "@/worker/types";

const VERIFICATION_INTERVAL_MS = 60_000;

export async function checkMonitor(monitor: Monitor): Promise<CheckResult> {
  if (monitor.monitorType === "port") {
    return checkPortMonitor(monitor);
  }

  if (monitor.monitorType === "postgres") {
    return checkPostgresMonitor(monitor);
  }

  return checkHttpMonitor(monitor);
}

export function calculateNextCheckAt(monitor: Monitor, checkedAt: Date) {
  return new Date(checkedAt.getTime() + intervalToMs(monitor.intervalValue, monitor.intervalUnit));
}

export function calculateVerificationCheckAt(checkedAt: Date) {
  return new Date(checkedAt.getTime() + VERIFICATION_INTERVAL_MS);
}
