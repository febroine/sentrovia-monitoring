export const MONITOR_HISTORY_RESET_EVENT = "sentrovia:monitor-history-reset";

const MONITOR_HISTORY_RESET_STORAGE_KEY = "sentrovia:monitor-history-reset";

export type MonitorHistoryResetDetail = {
  monitorIds: string[];
  occurredAt: number;
};

export function notifyMonitorHistoryReset(monitorIds: string[]) {
  if (typeof window === "undefined") return;

  const detail: MonitorHistoryResetDetail = {
    monitorIds: Array.from(new Set(monitorIds)),
    occurredAt: Date.now(),
  };
  window.dispatchEvent(new CustomEvent<MonitorHistoryResetDetail>(MONITOR_HISTORY_RESET_EVENT, { detail }));

  try {
    window.localStorage.setItem(MONITOR_HISTORY_RESET_STORAGE_KEY, String(detail.occurredAt));
  } catch {
    // Storage can be unavailable in private browsing; the in-page event still refreshes the report.
  }
}

export function subscribeToMonitorHistoryReset(
  listener: (detail: MonitorHistoryResetDetail) => void
) {
  if (typeof window === "undefined") return () => undefined;

  const handleEvent = (event: Event) => {
    const detail = parseResetDetail((event as CustomEvent<MonitorHistoryResetDetail>).detail);
    if (detail) listener(detail);
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== MONITOR_HISTORY_RESET_STORAGE_KEY || !event.newValue) return;
    const occurredAt = Number(event.newValue);
    if (Number.isFinite(occurredAt)) listener({ monitorIds: [], occurredAt });
  };

  window.addEventListener(MONITOR_HISTORY_RESET_EVENT, handleEvent);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(MONITOR_HISTORY_RESET_EVENT, handleEvent);
    window.removeEventListener("storage", handleStorage);
  };
}

function parseResetDetail(value: unknown): MonitorHistoryResetDetail | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MonitorHistoryResetDetail>;
  if (!Array.isArray(candidate.monitorIds)) return null;

  const monitorIds = candidate.monitorIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  return {
    monitorIds: Array.from(new Set(monitorIds)),
    occurredAt: typeof candidate.occurredAt === "number" ? candidate.occurredAt : Date.now(),
  };
}
