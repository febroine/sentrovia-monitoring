import type { IntervalUnit } from "@/lib/monitors/types";

function serializeMonitorDates<T extends Record<string, unknown>>(monitor: T) {
  return {
    ...monitor,
    createdAt: serializeDate(monitor.createdAt),
    updatedAt: serializeDate(monitor.updatedAt),
    lastCheckedAt: serializeDate(monitor.lastCheckedAt),
    nextCheckAt: serializeDate(monitor.nextCheckAt),
    lastSuccessAt: serializeDate(monitor.lastSuccessAt),
    lastFailureAt: serializeDate(monitor.lastFailureAt),
    sslExpiresAt: serializeDate(monitor.sslExpiresAt),
    heartbeatLastReceivedAt: serializeDate(monitor.heartbeatLastReceivedAt),
  };
}

export function serializeMonitorRecord<
  T extends Record<string, unknown> & { databasePasswordEncrypted?: unknown }
>(monitor: T) {
  const serialized = serializeMonitorDates(monitor);
  const safeMonitor = { ...serialized };
  delete safeMonitor.databasePasswordEncrypted;

  return {
    ...safeMonitor,
    databasePasswordConfigured: Boolean(monitor.databasePasswordEncrypted),
  };
}

export function parseIntervalSetting(value: string) {
  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)\s*(s|sn|sec|m|min|dk|h|hr|sa)$/);

  if (!match) {
    return { intervalValue: 1, intervalUnit: "dk" as const };
  }

  const amount = Number(match[1]) || 1;
  const unit = match[2];

  if (["s", "sn", "sec"].includes(unit)) {
    return { intervalValue: amount, intervalUnit: "sn" as const };
  }

  if (["h", "hr", "sa"].includes(unit)) {
    return { intervalValue: amount, intervalUnit: "sa" as const };
  }

  return { intervalValue: amount, intervalUnit: "dk" as const };
}

export function intervalToMs(intervalValue: number, intervalUnit: IntervalUnit | string) {
  if (intervalUnit === "sn") {
    return intervalValue * 1_000;
  }

  if (intervalUnit === "sa") {
    return intervalValue * 60 * 60 * 1_000;
  }

  return intervalValue * 60 * 1_000;
}

function serializeDate(value: unknown) {
  return value instanceof Date ? value.toISOString() : null;
}
