import net from "node:net";
import type { Monitor } from "@/lib/db/schema";
import { parsePortMonitorTarget } from "@/lib/monitors/targets";
import type { CheckResult } from "@/worker/types";

export function checkPortMonitor(monitor: Monitor): Promise<CheckResult> {
  const checkedAt = new Date();
  const target = parsePortMonitorTarget(monitor.url);

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
      resolve({
        ...result,
        checkedAt,
        latencyMs: Math.max(1, Date.now() - checkedAt.getTime()),
        sslExpiresAt: null,
      });
    };

    socket.setTimeout(monitor.timeout, () => {
      finish({
        ok: false,
        status: "down",
        statusCode: null,
        errorMessage: `TCP check timed out after ${monitor.timeout}ms`,
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
      });
    });
  });
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
