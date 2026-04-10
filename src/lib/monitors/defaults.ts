import type { MonitorPayload } from "@/lib/monitors/types";
import { DEFAULT_MONITOR_FORM } from "@/lib/monitors/types";
import type { SettingsPayload } from "@/lib/settings/types";
import { parseIntervalSetting } from "@/lib/monitors/utils";

export function buildDefaultMonitorForm(settings: SettingsPayload | null) {
  if (!settings) {
    return DEFAULT_MONITOR_FORM;
  }

  const interval = parseIntervalSetting(settings.monitoring.interval);

  return {
    ...DEFAULT_MONITOR_FORM,
    intervalValue: interval.intervalValue,
    intervalUnit: interval.intervalUnit,
    timeout: settings.monitoring.timeout,
    retries: settings.monitoring.retries,
    method: settings.monitoring.method as MonitorPayload["method"],
    responseMaxLength: settings.monitoring.responseMaxLength,
    maxRedirects: settings.monitoring.maxRedirects,
    ignoreSslErrors: settings.monitoring.ignoreSslErrors,
    telegramTemplate: settings.notifications.defaultTelegramTemplate,
    emailSubject: settings.notifications.defaultEmailSubjectTemplate,
    emailBody: settings.notifications.defaultEmailBodyTemplate,
  };
}

export function applyMonitorDefaults(
  input: unknown,
  settings: SettingsPayload | null
) {
  const defaults = buildDefaultMonitorForm(settings);
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  return {
    ...defaults,
    ...record,
  };
}
