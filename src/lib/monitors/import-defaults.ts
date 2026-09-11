import type { SettingsPayload } from "@/lib/settings/types";

type IntervalDefaults = {
  intervalValue: number;
  intervalUnit: "sn" | "dk" | "sa";
};

function isMissingImportValue(value: unknown) {
  return value === undefined || value === null || value === "";
}

export function normalizeImportedMonitorUrl(value: unknown, monitorType: unknown) {
  if (typeof value !== "string" || !["http", "keyword", "json"].includes(String(monitorType))) {
    return value;
  }

  const target = value.trim();
  if (!target || /^[a-z][a-z\d+.-]*:\/\//i.test(target)) {
    return target;
  }

  return target.startsWith("//") ? `https:${target}` : `https://${target}`;
}

export function applyImportDefaults(
  item: unknown,
  settings: SettingsPayload | null,
  intervalDefaults: IntervalDefaults
) {
  const record = item && typeof item === "object" ? ({ ...item } as Record<string, unknown>) : {};

  if (isMissingImportValue(record.intervalValue)) {
    record.intervalValue = intervalDefaults.intervalValue;
  }

  if (isMissingImportValue(record.intervalUnit)) {
    record.intervalUnit = intervalDefaults.intervalUnit;
  }

  if (isMissingImportValue(record.timeout)) {
    record.timeout = settings?.monitoring.timeout ?? 60_000;
  }

  if (isMissingImportValue(record.slowResponseThresholdMs)) {
    record.slowResponseThresholdMs = settings?.monitoring.slowResponseThresholdMs ?? null;
  }

  if (isMissingImportValue(record.monitorType)) {
    record.monitorType = "http";
  }

  record.url = normalizeImportedMonitorUrl(record.url, record.monitorType);

  if (isMissingImportValue(record.notificationPref)) {
    record.notificationPref = settings?.notifications.defaultMonitorNotificationPref ?? "both";
  }

  if (isMissingImportValue(record.publishOnStatusPage)) {
    record.publishOnStatusPage = true;
  }

  if (isMissingImportValue(record.retries)) {
    record.retries = settings?.monitoring.retries ?? 3;
  }

  if (isMissingImportValue(record.method)) {
    record.method = settings?.monitoring.method ?? "GET";
  }

  if (isMissingImportValue(record.responseMaxLength)) {
    record.responseMaxLength = settings?.monitoring.responseMaxLength ?? 1024;
  }

  if (isMissingImportValue(record.maxRedirects)) {
    record.maxRedirects = settings?.monitoring.maxRedirects ?? 5;
  }

  return record;
}
