export type ReportCadence = "weekly" | "monthly";
export type ReportScope = "global" | "company";
export type ReportScheduleStatus = "idle" | "delivered" | "failed";
export type ReportTemplateVariant = "executive" | "operations" | "client";

export interface ReportPreviewInput {
  scope: ReportScope;
  cadence: ReportCadence;
  companyId?: string | null;
  template?: ReportTemplateVariant;
  deliveryDetailLevel?: "summary" | "standard" | "full";
  attachCsv?: boolean;
  attachHtml?: boolean;
  attachPdf?: boolean;
  includeIncidentSummary?: boolean;
  includeMonitorBreakdown?: boolean;
  emailSubjectTemplate?: string | null;
  emailIntroTemplate?: string | null;
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
  deliveryDetailLevel: "summary" | "standard" | "full";
  attachCsv: boolean;
  attachHtml: boolean;
  attachPdf: boolean;
  includeIncidentSummary: boolean;
  includeMonitorBreakdown: boolean;
  emailSubjectTemplate: string | null;
  emailIntroTemplate: string | null;
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
    upChecks: number;
    downChecks: number;
    pendingChecks: number;
    uptimePct: number;
    averageLatencyMs: number;
    p95LatencyMs: number;
    failureEvents: number;
    impactedMonitors: number;
    failureRatePct: number;
    healthScore: number;
    healthStatus: string;
  };
  recommendations: string[];
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
  recentFailures: Array<{
    monitorId: string;
    name: string;
    statusCode: number | null;
    message: string | null;
    rcaSummary: string | null;
    createdAt: string;
  }>;
  monitorBreakdown: Array<{
    monitorId: string;
    name: string;
    url: string;
    companyName: string | null;
    status: string;
    currentStatusCode: number | null;
    lastCheckedAt: string | null;
    lastFailureAt: string | null;
    lastErrorMessage: string | null;
    uptimePct: number;
    averageLatencyMs: number;
    p95LatencyMs: number;
    totalChecks: number;
    upChecks: number;
    downChecks: number;
    pendingChecks: number;
    failures: number;
  }>;
}
