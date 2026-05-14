import { parse, stringify } from "yaml";
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
  let parsed: unknown;

  try {
    parsed = format === "yaml" ? parse(raw) : JSON.parse(raw);
  } catch {
    throw new Error("The uploaded monitor config bundle is invalid.");
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { monitors?: unknown[] }).monitors)) {
    throw new Error("The uploaded monitor config bundle is invalid.");
  }

  return parsed as MonitorConfigBundle & { monitors: MonitorPayload[] };
}
