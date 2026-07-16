import { parse, stringify } from "yaml";
import { MONITOR_CONFIG_IMPORT_LIMITS } from "@/lib/import-limits";
import type { MonitorInput } from "@/lib/monitors/schemas";
import {
  assertMonitorNetworkTargetAllowed,
  getMonitorImportIdentityKey,
  listMonitors,
  listReservedMonitorTargets,
} from "@/lib/monitors/service";
import { buildCanonicalMonitorTarget, buildMonitorIdentityKey, getMonitorTargetDisplay, toMonitorPayload } from "@/lib/monitors/targets";
import { serializeMonitorRecord } from "@/lib/monitors/utils";
import type { MonitorConfigBundle, MonitorPayload, MonitorRecord, MonitorType } from "@/lib/monitors/types";

export async function buildMonitorConfigBundle(userId: string): Promise<MonitorConfigBundle> {
  const monitors = await listMonitors(userId);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "sentrovia",
    monitors: monitors.map((monitor) =>
      redactMonitorExportSecrets(toMonitorPayload(serializeMonitorRecord(monitor) as MonitorRecord))
    ),
  };
}

export function redactMonitorExportSecrets(monitor: MonitorPayload): MonitorPayload {
  return {
    ...monitor,
    heartbeatToken: "",
    telegramBotToken: "",
    telegramChatId: "",
    notificationPref: resolveRedactedNotificationPreference(monitor.notificationPref),
  };
}

function resolveRedactedNotificationPreference(preference: MonitorPayload["notificationPref"]) {
  if (preference === "both") {
    return "email";
  }

  return preference === "telegram" ? "none" : preference;
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

export async function previewMonitorConfigImport(userId: string, inputs: MonitorInput[]) {
  const [existing, validationErrors] = await Promise.all([
    listReservedMonitorTargets(userId),
    Promise.all(inputs.map(validateImportNetworkTarget)),
  ]);
  return buildMonitorConfigImportPreview(inputs, existing, validationErrors);
}

export function buildMonitorConfigImportPreview(
  inputs: MonitorInput[],
  existing: Array<{ monitorType: string; url: string }>,
  validationErrors: Array<string | null> = []
) {
  const seenTargets = new Set(
    existing.map((monitor) => buildMonitorIdentityKey({ monitorType: monitor.monitorType as MonitorType, url: monitor.url }))
  );

  const items = inputs.map((monitor, index) => {
    const target = buildCanonicalMonitorTarget(monitor);
    const validationError = validationErrors[index] ?? null;
    if (validationError) {
      return {
        index: index + 1,
        name: monitor.name,
        target: getMonitorTargetDisplay({ monitorType: monitor.monitorType, url: target }),
        status: "invalid" as const,
        reason: validationError,
      };
    }

    const identityKey = getMonitorImportIdentityKey(monitor);
    const duplicate = identityKey ? seenTargets.has(identityKey) : false;
    if (identityKey) {
      seenTargets.add(identityKey);
    }

    return {
      index: index + 1,
      name: monitor.name,
      target: getMonitorTargetDisplay({ monitorType: monitor.monitorType, url: target }),
      status: duplicate ? "skipped" as const : "added" as const,
      reason: duplicate ? "A monitor with this target already exists in the workspace or import bundle." : null,
    };
  });

  return {
    items,
    summary: {
      added: items.filter((item) => item.status === "added").length,
      skipped: items.filter((item) => item.status === "skipped").length,
      invalid: items.filter((item) => item.status === "invalid").length,
    },
  };
}

async function validateImportNetworkTarget(monitor: MonitorInput) {
  try {
    await assertMonitorNetworkTargetAllowed(
      monitor.monitorType,
      buildCanonicalMonitorTarget(monitor)
    );
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Monitor target is not allowed by the current network safety policy.";
  }
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
