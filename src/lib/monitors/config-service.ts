import { parse, stringify } from "yaml";
import { MONITOR_CONFIG_IMPORT_LIMITS } from "@/lib/import-limits";
import { listMonitors } from "@/lib/monitors/service";
import { toMonitorPayload } from "@/lib/monitors/targets";
import { serializeMonitorRecord } from "@/lib/monitors/utils";
import type { MonitorConfigBundle, MonitorPayload, MonitorRecord } from "@/lib/monitors/types";

export async function buildMonitorConfigBundle(userId: string): Promise<MonitorConfigBundle> {
  const monitors = await listMonitors(userId);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "sentrovia",
    monitors: monitors.map((monitor) => toMonitorPayload(serializeMonitorRecord(monitor) as MonitorRecord)),
  };
}

export function serializeMonitorConfigBundle(bundle: MonitorConfigBundle, format: "json" | "yaml") {
  return format === "yaml" ? stringify(bundle) : JSON.stringify(bundle, null, 2);
}

export function parseMonitorConfigBundle(raw: string, format: "json" | "yaml") {
  assertMonitorConfigSize(raw);
  let parsed: unknown;

  try {
    parsed = format === "yaml" ? parse(raw) : JSON.parse(raw);
  } catch {
    throw new Error("The uploaded monitor config bundle is invalid.");
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { monitors?: unknown[] }).monitors)) {
    throw new Error("The uploaded monitor config bundle is invalid.");
  }

  const bundle = parsed as MonitorConfigBundle & { monitors: MonitorPayload[] };
  assertMonitorConfigItemCount(bundle.monitors.length);
  return bundle;
}

function assertMonitorConfigSize(raw: string) {
  if (Buffer.byteLength(raw, "utf8") > MONITOR_CONFIG_IMPORT_LIMITS.maxBytes) {
    throw new Error("The uploaded monitor config bundle is too large.");
  }
}

function assertMonitorConfigItemCount(count: number) {
  if (count > MONITOR_CONFIG_IMPORT_LIMITS.maxMonitors) {
    throw new Error(`Import at most ${MONITOR_CONFIG_IMPORT_LIMITS.maxMonitors} monitors at a time.`);
  }
}
