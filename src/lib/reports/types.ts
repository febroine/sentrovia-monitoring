export type ReportCadence = "weekly" | "monthly";
export type ReportScope = "global" | "company";
export type ReportScheduleStatus = "idle" | "delivered" | "failed";
export type ReportTemplateVariant = "executive" | "operations" | "client";

export interface ReportPreviewInput {
  scope: ReportScope;
  cadence: ReportCadence;
  companyId?: string | null;
  template?: ReportTemplateVariant;
}

export interface ReportScheduleInput extends ReportPreviewInput {
  name: string;
  recipientEmails: string[];
  isActive: boolean;
  nextRunAt?: string | null;
}

export interface ReportScheduleRecord {
  id: string;
  name: string;
  scope: ReportScope;
  cadence: ReportCadence;
  template: ReportTemplateVariant;
  companyId: string | null;
  companyName: string | null;
  recipientEmails: string[];
  isActive: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastDeliveredAt: string | null;
  lastStatus: ReportScheduleStatus;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedReport {
  title: string;
  scope: ReportScope;
  cadence: ReportCadence;
  template: ReportTemplateVariant;
  companyId: string | null;
  companyName: string | null;
  workspaceName: string;
  templateLabel: string;
  generatedAt: string;
  periodStartedAt: string;
  periodEndedAt: string;
  periodLabel: string;
  summary: {
    monitorCount: number;
    currentlyUp: number;
    currentlyDown: number;
    currentlyPending: number;
    totalChecks: number;
    uptimePct: number;
    averageLatencyMs: number;
    failureEvents: number;
  };
  statusCodes: Array<{
    statusCode: number;
    count: number;
  }>;
  slowMonitors: Array<{
    monitorId: string;
    name: string;
    averageLatencyMs: number;
    checks: number;
  }>;
  failingMonitors: Array<{
    monitorId: string;
    name: string;
    failures: number;
    lastFailureAt: string | null;
  }>;
  monitorBreakdown: Array<{
    monitorId: string;
    name: string;
    status: string;
    uptimePct: number;
    averageLatencyMs: number;
    totalChecks: number;
    failures: number;
  }>;
}
