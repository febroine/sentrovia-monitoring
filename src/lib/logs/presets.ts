import type { LogRecord } from "@/lib/logs/types";

export const EXPORT_PRESETS = [
  { id: "csv-filtered", label: "CSV · Filtered result" },
  { id: "csv-selected", label: "CSV · Selected rows" },
  { id: "json-filtered", label: "JSON · Filtered result" },
  { id: "json-selected", label: "JSON · Selected rows" },
] as const;

export function buildCsv(rows: LogRecord[]) {
  const header = ["timestamp", "level", "eventType", "company", "monitor", "message", "statusCode", "latencyMs"];
  return [
    header.join(","),
    ...rows.map((log) =>
      [
        log.createdAt,
        log.level,
        log.eventType,
        wrap(log.companyName ?? ""),
        wrap(log.monitorName ?? ""),
        wrap(log.message ?? ""),
        log.statusCode ?? "",
        log.latencyMs ?? "",
      ].join(",")
    ),
  ].join("\n");
}

function wrap(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
