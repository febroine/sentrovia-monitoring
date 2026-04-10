export type LogLevel = "info" | "warning" | "error" | "critical";

export interface LogRecord {
  id: string;
  createdAt: string;
  level: LogLevel;
  eventType: string;
  message: string | null;
  status: string | null;
  statusCode: number | null;
  latencyMs: number | null;
  rcaType: string | null;
  rcaTitle: string | null;
  rcaSummary: string | null;
  companyId: string | null;
  companyName: string | null;
  monitorId: string | null;
  monitorName: string | null;
  detailTitle: string | null;
  detailSummary: string | null;
  detailItems: Array<{ label: string; value: string }>;
}

export interface LogFilters {
  search: string;
  level: string;
  companyQuery: string;
  monitorQuery: string;
  from: string;
  to: string;
  statusCode: string;
}

export interface LogPresetRecord {
  id: string;
  name: string;
  filters: LogFilters;
}
