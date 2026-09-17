import { parse, stringify } from "yaml";
import { MONITOR_CONFIG_IMPORT_LIMITS } from "@/lib/import-limits";
import { DEFAULT_MONITOR_FORM } from "@/lib/monitors/types";
import type { MonitorInput } from "@/lib/monitors/schemas";
import {
  assertMonitorNetworkTargetAllowed,
  getMonitorImportIdentityKey,
  listMonitors,
  listReservedMonitorTargets,
} from "@/lib/monitors/service";
import { canUserAccessPrivateTargets } from "@/lib/security/network-policy";
import { buildCanonicalMonitorTarget, buildMonitorIdentityKey, getMonitorTargetDisplay, toMonitorPayload } from "@/lib/monitors/targets";
import { serializeMonitorRecord } from "@/lib/monitors/utils";
import type { MonitorConfigBundle, MonitorPayload, MonitorRecord, MonitorType } from "@/lib/monitors/types";

export type MonitorConfigImportPreview = {
  items: Array<{
    index: number;
    name: string;
    target: string;
    status: "added" | "updated" | "skipped" | "invalid";
    reason: string | null;
    monitorId?: string;
    changedFields?: string[];
  }>;
  summary: { added: number; updated: number; skipped: number; invalid: number };
};

type MonitorConfigImportOptions = {
  updateExisting?: boolean;
  ids?: Array<string | undefined>;
  applyRedactedNotificationPrefs?: boolean[];
};

export async function buildMonitorConfigBundle(
  userId: string,
  workspaceId?: string
): Promise<MonitorConfigBundle> {
  const monitors = await listMonitors(userId, undefined, workspaceId);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "sentrovia",
    monitors: monitors.map((monitor) => ({
      id: monitor.id,
      ...redactMonitorExportSecrets(toMonitorPayload(serializeMonitorRecord(monitor) as MonitorRecord)),
    })),
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
  if (bundle.version !== 1 || bundle.source !== "sentrovia") {
    throw new Error("The monitor config bundle version or source is not supported.");
  }

  assertMonitorConfigItemCount(bundle.monitors.length);
  return bundle;
}

export async function previewMonitorConfigImport(
  userId: string,
  inputs: MonitorInput[],
  workspaceId?: string,
  options: MonitorConfigImportOptions = {}
) {
  const [existing, allowPrivateTargets] = await Promise.all([
    options.updateExisting
      ? listMonitors(userId, undefined, workspaceId).then((rows) => rows.map((monitor) => ({
          id: monitor.id,
          monitorType: monitor.monitorType,
          url: monitor.url,
          config: toMonitorPayload(serializeMonitorRecord(monitor) as MonitorRecord),
        })))
      : listReservedMonitorTargets(userId, undefined, workspaceId),
    canUserAccessPrivateTargets(userId, undefined, workspaceId),
  ]);
  const validationErrors = await Promise.all(
    inputs.map((input) => validateImportNetworkTarget(input, allowPrivateTargets))
  );
  return buildMonitorConfigImportPreview(inputs, existing, validationErrors, options);
}

export function buildMonitorConfigImportPreview(
  inputs: MonitorInput[],
  existing: Array<{ id?: string; monitorType: string; url: string; config?: MonitorPayload }>,
  validationErrors: Array<string | null> = [],
  options: MonitorConfigImportOptions = {}
): MonitorConfigImportPreview {
  const byId = new Map(existing.filter((monitor) => monitor.id).map((monitor) => [monitor.id!, monitor]));
  const byTarget = new Map(existing.map((monitor) => [
    buildMonitorIdentityKey({ monitorType: monitor.monitorType as MonitorType, url: monitor.url }), monitor,
  ]));
  const seenTargets = new Set<string>();
  const seenIds = new Set<string>();

  const items: MonitorConfigImportPreview["items"] = inputs.map((monitor, index) => {
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
    const requestedId = options.ids?.[index];
    const matched = options.updateExisting
      ? (requestedId ? byId.get(requestedId) : undefined) ?? (identityKey ? byTarget.get(identityKey) : undefined)
      : undefined;
    if (matched && matched.monitorType !== monitor.monitorType) {
      return { index: index + 1, name: monitor.name, target, status: "invalid" as const, reason: "A monitor's type cannot be changed by import." };
    }
    if (options.updateExisting && monitor.monitorType === "heartbeat" && !requestedId && !identityKey) {
      return { index: index + 1, name: monitor.name, target, status: "invalid" as const, reason: "This heartbeat needs a monitor ID to update safely. Export a new bundle first." };
    }
    const conflictingTarget = identityKey ? byTarget.get(identityKey) : undefined;
    if (matched && conflictingTarget && conflictingTarget.id !== matched.id) {
      return { index: index + 1, name: monitor.name, target, status: "invalid" as const, reason: "The target belongs to another monitor in this workspace." };
    }
    if (matched?.config?.monitorType === "postgres" && !monitor.databasePassword && (
      (identityKey && identityKey !== buildMonitorIdentityKey({ monitorType: "postgres", url: matched.url }))
      || monitor.databaseSsl !== matched.config.databaseSsl
      || monitor.databaseTlsVerify !== matched.config.databaseTlsVerify
    )) {
      return { index: index + 1, name: monitor.name, target, status: "invalid" as const, reason: "Re-enter the database password after changing connection settings." };
    }
    const duplicate = Boolean((identityKey && seenTargets.has(identityKey)) || (matched?.id && seenIds.has(matched.id)));
    if (identityKey) {
      seenTargets.add(identityKey);
    }
    if (matched?.id) seenIds.add(matched.id);

    const currentConfig = matched?.config;
    const updateInput = currentConfig
      ? preserveRedactedMonitorSettings(monitor, currentConfig, options.applyRedactedNotificationPrefs?.[index])
      : monitor;
    const changedFields = currentConfig ? getChangedMonitorFields(updateInput, currentConfig) : [];
    const unchanged = Boolean(currentConfig && changedFields.length === 0);
    const status = duplicate || (!options.updateExisting && Boolean(conflictingTarget))
      ? "skipped" as const
      : matched ? unchanged ? "skipped" as const : "updated" as const : "added" as const;

    return {
      index: index + 1,
      name: monitor.name,
      target: getMonitorTargetDisplay({ monitorType: monitor.monitorType, url: target }),
      status,
      monitorId: status === "updated" ? matched?.id : undefined,
      changedFields: status === "updated" ? changedFields : undefined,
      reason: duplicate ? "This monitor appears more than once in the import bundle."
        : unchanged ? "No configuration changes."
        : !options.updateExisting && conflictingTarget ? "A monitor with this target already exists in the workspace." : null,
    };
  });

  return {
    items,
    summary: {
      added: items.filter((item) => item.status === "added").length,
      updated: items.filter((item) => item.status === "updated").length,
      skipped: items.filter((item) => item.status === "skipped").length,
      invalid: items.filter((item) => item.status === "invalid").length,
    },
  };
}

export function preserveRedactedMonitorSettings(
  input: MonitorInput,
  current: MonitorPayload,
  applyRedactedNotificationPref = false
): MonitorInput {
  const secretWasRedacted = !input.telegramBotToken && !input.telegramChatId && Boolean(current.telegramBotToken);
  const preferenceWasRedacted = !input.telegramBotToken && !input.telegramChatId && (
    (current.notificationPref === "both" && input.notificationPref === "email")
    || (current.notificationPref === "telegram" && input.notificationPref === "none")
  );
  return {
    ...input,
    telegramBotToken: secretWasRedacted ? current.telegramBotToken : input.telegramBotToken ?? "",
    telegramChatId: secretWasRedacted ? current.telegramChatId : input.telegramChatId ?? "",
    notificationPref: !applyRedactedNotificationPref && (secretWasRedacted || preferenceWasRedacted)
      ? current.notificationPref : input.notificationPref,
    databasePasswordConfigured: input.databasePasswordConfigured || current.databasePasswordConfigured,
  };
}

function getChangedMonitorFields(input: MonitorInput, current: MonitorPayload) {
  const changed = Object.keys(DEFAULT_MONITOR_FORM)
    .filter((key) => key !== "heartbeatLastReceivedAt" && key !== "heartbeatToken")
    .filter((key) => JSON.stringify(input[key as keyof MonitorInput]) !== JSON.stringify(current[key as keyof MonitorPayload]));
  return Array.from(new Set(changed.map((key) => {
    if (key === "telegramBotToken" || key === "telegramChatId") return "Telegram credentials";
    if (key === "databasePassword") return "Database password";
    return key;
  })));
}

async function validateImportNetworkTarget(monitor: MonitorInput, allowPrivateTargets: boolean) {
  try {
    await assertMonitorNetworkTargetAllowed(
      monitor.monitorType,
      buildCanonicalMonitorTarget(monitor),
      allowPrivateTargets
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
