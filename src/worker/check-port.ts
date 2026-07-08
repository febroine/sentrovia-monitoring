import net from "node:net";
import type { Monitor } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { parsePortMonitorTarget } from "@/lib/monitors/targets";
import { assertMonitorNetworkTarget } from "@/lib/security/public-network-target";
import { classifyFailureMessage, formatTimeoutDuration } from "@/worker/failure-reasons";
import type { CheckResult } from "@/worker/types";

const MONITOR_PUBLIC_TARGET_ERROR = "Monitor target is not allowed by the current network safety policy.";

export async function checkPortMonitor(monitor: Monitor): Promise<CheckResult> {
  const checkedAt = new Date();
  const target = parsePortMonitorTarget(monitor.url);

  try {
    await assertMonitorNetworkTarget(target.host, {
      allowPrivateTargets: env.monitorAllowPrivateTargets,
      message: MONITOR_PUBLIC_TARGET_ERROR,
    });
    return await checkTcpPort(monitor, target, checkedAt);
  } catch (error) {
    return buildCheckResult(checkedAt, {
      ok: false,
      status: "down",
      statusCode: null,
      errorMessage: error instanceof Error ? error.message : "TCP check failed",
      failureReason: classifyFailureMessage(error instanceof Error ? error.message : "TCP check failed", "connection"),
    });
  }
}

function checkTcpPort(
  monitor: Monitor,
  target: ReturnType<typeof parsePortMonitorTarget>,
  checkedAt: Date
): Promise<CheckResult> {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: target.host,
      port: target.port,
      family: toNodeFamily(monitor.ipFamily),
    });
    let settled = false;

    const finish = (result: Omit<CheckResult, "checkedAt" | "latencyMs" | "sslExpiresAt">) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(buildCheckResult(checkedAt, result));
    };

    socket.setTimeout(monitor.timeout, () => {
      finish({
        ok: false,
        status: "down",
        statusCode: null,
        errorMessage: `TCP service did not respond within ${formatTimeoutDuration(monitor.timeout)}.`,
        failureReason: "timeout",
      });
    });
    socket.once("connect", () => {
      finish({
        ok: true,
        status: "up",
        statusCode: null,
        errorMessage: null,
      });
    });
    socket.once("error", (error) => {
      finish({
        ok: false,
        status: "down",
        statusCode: null,
        errorMessage: error.message,
        failureReason: classifyFailureMessage(error.message, "connection"),
      });
    });
  });
}

function buildCheckResult(
  checkedAt: Date,
  result: Omit<CheckResult, "checkedAt" | "latencyMs" | "sslExpiresAt">
): CheckResult {
  return {
    ...result,
    checkedAt,
    latencyMs: Math.max(1, Date.now() - checkedAt.getTime()),
    sslExpiresAt: null,
  };
}

function toNodeFamily(ipFamily: Monitor["ipFamily"]) {
  if (ipFamily === "ipv4") {
    return 4;
  }

  if (ipFamily === "ipv6") {
    return 6;
  }

  return undefined;
}
