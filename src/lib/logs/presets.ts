import type { LogRecord } from "@/lib/logs/types";

export const EXPORT_PRESETS = [
  { id: "csv-filtered", label: "CSV - Filtered result" },
  { id: "csv-selected", label: "CSV - Selected rows" },
  { id: "json-filtered", label: "JSON - Filtered result" },
  { id: "json-selected", label: "JSON - Selected rows" },
] as const;

export function buildCsv(rows: LogRecord[]) {
  const header = ["timestamp", "level", "eventType", "company", "monitor", "message", "statusCode", "latencyMs"];
  return [
    header.join(","),
    ...rows.map((log) =>
      [
        wrap(log.createdAt),
        wrap(log.level),
        wrap(log.eventType),
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
  const trimmed = value.trimStart();
  const leadingWhitespace = value.slice(0, value.length - trimmed.length);
  const hasLeadingControl = [...leadingWhitespace].some((character) => character.charCodeAt(0) < 32)
    || (trimmed.length > 0 && trimmed.charCodeAt(0) < 32);
  // CSV quoting escapes delimiters but does not stop spreadsheet formula interpretation.
  const text = /^[=+@-]/.test(trimmed) || hasLeadingControl ? `'${value}` : value;
  return `"${text.replaceAll('"', '""')}"`;
}
