import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Monitor } from "@/lib/db/schema";
import { parsePingMonitorTarget } from "@/lib/monitors/targets";
import type { CheckResult } from "@/worker/types";

const execFileAsync = promisify(execFile);

export async function checkPingMonitor(monitor: Monitor): Promise<CheckResult> {
  const checkedAt = new Date();
  const target = parsePingMonitorTarget(monitor.url);

  try {
    const latencyMs = await measurePingLatency(target.host, monitor.timeout);
    return {
      ok: true,
      status: "up",
      statusCode: 200,
      latencyMs,
      errorMessage: null,
      checkedAt,
      sslExpiresAt: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: "down",
      statusCode: null,
      latencyMs: null,
      errorMessage: error instanceof Error ? error.message : "Ping failed",
      checkedAt,
      sslExpiresAt: null,
    };
  }
}

async function measurePingLatency(host: string, timeoutMs: number) {
  assertSafePingHost(host);
  const { command, args } = buildPingCommand(host, timeoutMs);
  const { stdout, stderr } = await execFileAsync(command, args, {
    timeout: Math.max(timeoutMs + 1_000, 2_000),
    windowsHide: true,
  });
  const output = `${stdout}\n${stderr}`;
  return parsePingLatency(output) ?? 1;
}

function assertSafePingHost(host: string) {
  const normalizedHost = host.trim();

  if (!normalizedHost || normalizedHost.startsWith("-") || /[\s/?#]/.test(normalizedHost)) {
    throw new Error("Ping monitor host is invalid.");
  }
}

function buildPingCommand(host: string, timeoutMs: number) {
  if (process.platform === "win32") {
    return {
      command: "ping",
      args: ["-n", "1", "-w", String(Math.max(timeoutMs, 1000)), host],
    };
  }

  return {
    command: "ping",
    args: ["-c", "1", "-W", String(Math.max(1, Math.ceil(timeoutMs / 1000))), host],
  };
}

export function parsePingLatency(output: string) {
  const unixMatch = output.match(/(?:time|süre)[=<]\s*([\d.,]+)\s*ms/i);
  if (unixMatch) {
    return toLatencyMs(unixMatch[1]);
  }

  const windowsMatch = output.match(/(?:average|ortalama)[^=]*=\s*([\d.,]+)\s*ms/i);
  if (windowsMatch) {
    return toLatencyMs(windowsMatch[1]);
  }

  return null;
}

function toLatencyMs(raw: string) {
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : null;
}
