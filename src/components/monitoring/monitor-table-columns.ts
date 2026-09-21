export const MONITOR_OPTIONAL_COLUMNS = [
  { id: "target", label: "Target" },
  { id: "state", label: "State" },
  { id: "notify", label: "Channels" },
  { id: "company", label: "Company" },
  { id: "observed", label: "Observed" },
  { id: "delivery", label: "Last delivery" },
] as const;

export type MonitorOptionalColumn = (typeof MONITOR_OPTIONAL_COLUMNS)[number]["id"];

export const DEFAULT_MONITOR_COLUMNS: MonitorOptionalColumn[] = [
  "target", "state", "company", "observed", "delivery",
];

export function parseMonitorTablePreferences(value: string | null) {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const data = parsed as { columns?: unknown; pageSize?: unknown; sort?: unknown; direction?: unknown };
    const allowed = new Set<string>(MONITOR_OPTIONAL_COLUMNS.map((column) => column.id));
    return {
      columns: Array.isArray(data.columns)
        ? [...new Set(data.columns.filter((column): column is MonitorOptionalColumn => typeof column === "string" && allowed.has(column)))]
        : DEFAULT_MONITOR_COLUMNS,
      pageSize: [10, 50, 100, 500].includes(Number(data.pageSize)) ? Number(data.pageSize) : 10,
      sort: ["createdAt", "name", "status", "lastCheckedAt", "latencyMs"].includes(String(data.sort)) ? data.sort as "createdAt" | "name" | "status" | "lastCheckedAt" | "latencyMs" : "createdAt",
      direction: data.direction === "asc" ? "asc" as const : "desc" as const,
    };
  } catch {
    return null;
  }
}
