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
  const { command, args } = buildPingCommand(host, timeoutMs);
  const { stdout, stderr } = await execFileAsync(command, args, {
    timeout: Math.max(timeoutMs + 1_000, 2_000),
    windowsHide: true,
  });
  const output = `${stdout}\n${stderr}`;
  const latencyMs = parsePingLatency(output);

  if (latencyMs === null) {
    throw new Error(`Ping succeeded but latency could not be parsed for ${host}.`);
  }

  return latencyMs;
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

function parsePingLatency(output: string) {
  const unixMatch = output.match(/time[=<]([\d.]+)\s*ms/i);
  if (unixMatch) {
    return Math.max(1, Math.round(Number(unixMatch[1])));
  }

  const windowsMatch = output.match(/average\s*=\s*(\d+)\s*ms/i);
  if (windowsMatch) {
    return Math.max(1, Number(windowsMatch[1]));
  }

  return null;
}
