import writeExcelFile from "write-excel-file/node";

export type MonitorExportFormat = "xlsx" | "csv" | "json";

type MonitorExportSource = {
  id: string;
  name: string;
  monitorType: string;
  url: string;
  company: string | null;
  status: string;
  statusCode: number | null;
  uptime: string;
  isActive: boolean;
  publishOnStatusPage: boolean;
  isFavorite: boolean;
  isCritical: boolean;
  latencyMs: number | null;
  intervalValue: number;
  intervalUnit: string;
  timeout: number;
  retries: number;
  method: string;
  tags: string[];
  notificationPref: string;
  sendOutageScreenshot: boolean;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  sslExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MonitorExportRow = Record<(typeof MONITOR_EXPORT_COLUMNS)[number]["key"], string | number | boolean | null>;

const MONITOR_EXPORT_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "target", label: "Target" },
  { key: "company", label: "Company" },
  { key: "status", label: "Status" },
  { key: "statusCode", label: "Status code" },
  { key: "active", label: "Active" },
  { key: "uptime", label: "Uptime" },
  { key: "latencyMs", label: "Latency (ms)" },
  { key: "interval", label: "Interval" },
  { key: "timeoutMs", label: "Timeout (ms)" },
  { key: "retries", label: "Retries" },
  { key: "method", label: "Method" },
  { key: "tags", label: "Tags" },
  { key: "notificationChannel", label: "Notification channel" },
  { key: "critical", label: "Critical" },
  { key: "favorite", label: "Favorite" },
  { key: "publicStatus", label: "Public status page" },
  { key: "outageScreenshot", label: "Outage screenshot" },
  { key: "lastCheckedAt", label: "Last checked" },
  { key: "lastSuccessAt", label: "Last success" },
  { key: "lastFailureAt", label: "Last failure" },
  { key: "sslExpiresAt", label: "SSL expires" },
  { key: "createdAt", label: "Created" },
  { key: "updatedAt", label: "Updated" },
] as const;

export function buildMonitorExportRows(
  monitors: MonitorExportSource[],
  selectedIds?: ReadonlySet<string>
): MonitorExportRow[] {
  return monitors
    .filter((monitor) => !selectedIds || selectedIds.has(monitor.id))
    .map((monitor) => ({
      id: monitor.id,
      name: monitor.name,
      type: monitor.monitorType,
      target: monitor.url,
      company: monitor.company,
      status: monitor.status,
      statusCode: monitor.statusCode,
      active: monitor.isActive,
      uptime: monitor.uptime,
      latencyMs: monitor.latencyMs,
      interval: `${monitor.intervalValue} ${monitor.intervalUnit}`,
      timeoutMs: monitor.timeout,
      retries: monitor.retries,
      method: monitor.method,
      tags: monitor.tags.join(", "),
      notificationChannel: monitor.notificationPref,
      critical: monitor.isCritical,
      favorite: monitor.isFavorite,
      publicStatus: monitor.publishOnStatusPage,
      outageScreenshot: monitor.sendOutageScreenshot,
      lastCheckedAt: serializeDate(monitor.lastCheckedAt),
      lastSuccessAt: serializeDate(monitor.lastSuccessAt),
      lastFailureAt: serializeDate(monitor.lastFailureAt),
      sslExpiresAt: serializeDate(monitor.sslExpiresAt),
      createdAt: serializeDate(monitor.createdAt),
      updatedAt: serializeDate(monitor.updatedAt),
    }));
}

export async function serializeMonitorExport(rows: MonitorExportRow[], format: MonitorExportFormat) {
  if (format === "json") {
    return Buffer.from(JSON.stringify(rows, null, 2), "utf8");
  }

  if (format === "csv") {
    const csvRows = [
      MONITOR_EXPORT_COLUMNS.map((column) => column.label),
      ...rows.map((row) => MONITOR_EXPORT_COLUMNS.map((column) => row[column.key])),
    ];
    return Buffer.from(`\uFEFF${csvRows.map(toCsvLine).join("\r\n")}`, "utf8");
  }

  const header = MONITOR_EXPORT_COLUMNS.map((column) => ({
    value: column.label,
    fontWeight: "bold" as const,
  }));
  const data = [
    header,
    ...rows.map((row) => MONITOR_EXPORT_COLUMNS.map((column) => row[column.key])),
  ];
  return writeExcelFile(data, { sheet: "Monitors" }).toBuffer();
}

export function getMonitorExportContentType(format: MonitorExportFormat) {
  if (format === "xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8";
}

function toCsvLine(values: Array<string | number | boolean | null>) {
  return values.map((value) => escapeCsvCell(value)).join(",");
}

function escapeCsvCell(value: string | number | boolean | null) {
  const raw = value === null ? "" : String(value);
  const safe = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function serializeDate(value: Date | null) {
  return value ? value.toISOString() : null;
}
