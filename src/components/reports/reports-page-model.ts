import type { CompanyRecord } from "@/lib/companies/types";
import type {
  ReportCadence,
  ReportPeriodRange,
  ReportScheduleRecord,
  ReportScope,
  ReportTemplateVariant,
} from "@/lib/reports/types";

export type ScheduleFilter = "all" | "active" | "paused" | "failed";
export type DeliveryResult = {
  status: string;
  deliveredAt: string | null;
  reportTitle: string;
  recipients: string[];
};

export type DraftReport = {
  scope: ReportScope;
  cadence: ReportCadence;
  template: ReportTemplateVariant;
  companyId: string;
  recipients: string;
  deliveryDetailLevel: "summary" | "standard" | "full";
  includeOutageSummary: boolean;
  includeMonitorBreakdown: boolean;
  emailSubjectTemplate: string;
  emailIntroTemplate: string;
  reportBrandName: string;
  periodRange: ReportPeriodRange;
  periodStartedAt: string;
  periodEndedAt: string;
  timeZone: string;
};

export type DraftSchedule = {
  name: string;
  scope: ReportScope;
  cadence: ReportCadence;
  template: ReportTemplateVariant;
  companyId: string;
  recipients: string;
  nextRunAt: string;
  isActive: boolean;
  deliveryDetailLevel: "summary" | "standard" | "full";
  includeOutageSummary: boolean;
  includeMonitorBreakdown: boolean;
  emailSubjectTemplate: string;
  emailIntroTemplate: string;
  reportBrandName: string;
};

export const EMPTY_REPORT_DRAFT: DraftReport = {
  scope: "global",
  cadence: "weekly",
  template: "operations",
  companyId: "",
  recipients: "",
  deliveryDetailLevel: "standard",
  includeOutageSummary: true,
  includeMonitorBreakdown: true,
  emailSubjectTemplate: "",
  emailIntroTemplate: "",
  reportBrandName: "",
  periodRange: "7d",
  periodStartedAt: "",
  periodEndedAt: "",
  timeZone: "",
};

export const EMPTY_SCHEDULE_DRAFT: DraftSchedule = {
  name: "Weekly Workspace Report",
  scope: "global",
  cadence: "weekly",
  template: "operations",
  companyId: "",
  recipients: "",
  nextRunAt: "",
  isActive: true,
  deliveryDetailLevel: "standard",
  includeOutageSummary: true,
  includeMonitorBreakdown: true,
  emailSubjectTemplate: "",
  emailIntroTemplate: "",
  reportBrandName: "",
};



export type ReportDeliveryDraft = Pick<
  DraftReport,
  | "deliveryDetailLevel"
  | "includeOutageSummary"
  | "includeMonitorBreakdown"
  | "emailSubjectTemplate"
  | "emailIntroTemplate"
  | "reportBrandName"
>;

export function filterSchedules(schedules: ReportScheduleRecord[], query: string, filter: ScheduleFilter) {
  const normalizedQuery = query.trim().toLowerCase();

  return schedules.filter((schedule) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      [schedule.name, schedule.companyName ?? "", schedule.recipientEmails.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);

    if (!matchesQuery) {
      return false;
    }

    if (filter === "active") {
      return schedule.isActive;
    }

    if (filter === "paused") {
      return !schedule.isActive;
    }

    if (filter === "failed") {
      return schedule.lastStatus === "failed";
    }

    return true;
  });
}

export function buildScheduleName(scope: ReportScope, cadence: ReportCadence, companyId: string, companies: CompanyRecord[]) {
  const cadenceLabel = getCadenceLabel(cadence);

  return buildScopedReportName(scope, companyId, companies, cadenceLabel);
}

export function buildDraftReportTitle(
  scope: ReportScope,
  cadence: ReportCadence,
  companyId: string,
  companies: CompanyRecord[],
  periodRange?: ReportPeriodRange
) {
  const periodLabel = periodRange === "custom" ? "Custom" : cadence === "weekly" ? "Weekly" : "Monthly";

  return buildScopedReportName(scope, companyId, companies, periodLabel);
}

function buildScopedReportName(scope: ReportScope, companyId: string, companies: CompanyRecord[], prefix: string) {

  if (scope !== "company") {
    return `${prefix} Workspace Report`;
  }

  const company = companies.find((item) => item.id === companyId);
  return company ? `${prefix} ${company.name} Report` : `${prefix} Company Report`;
}

export function resolveDraftScopeLabel(
  draft: Pick<DraftReport, "scope" | "companyId">,
  companies: CompanyRecord[]
) {
  if (draft.scope !== "company") {
    return "Workspace";
  }

  return companies.find((company) => company.id === draft.companyId)?.name ?? "Company";
}

export function resolveDraftPeriodLabel(draft: Pick<DraftReport, "periodRange" | "periodStartedAt" | "periodEndedAt" | "timeZone">) {
  const timeZone = draft.timeZone || "Local time";
  if (draft.periodRange === "custom") {
    return draft.periodStartedAt && draft.periodEndedAt
      ? `${draft.periodStartedAt} – ${draft.periodEndedAt} (${timeZone})`
      : `Custom range (${timeZone})`;
  }
  return draft.periodRange === "30d" ? `Last 30 days (${timeZone})` : `Last 7 days (${timeZone})`;
}

export function buildReportPeriodPayload(draft: DraftReport) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  if (draft.periodRange !== "custom") {
    return { periodRange: draft.periodRange, timeZone };
  }

  return {
    periodRange: draft.periodRange,
    periodStartedAt: toLocalDayBoundaryIso(draft.periodStartedAt, false),
    periodEndedAt: toLocalDayBoundaryIso(draft.periodEndedAt, true),
    timeZone,
  };
}

function toLocalDayBoundaryIso(value: string, endExclusive: boolean) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (endExclusive) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

export function getCadenceLabel(cadence: ReportCadence) {
  return normalizeCadence(cadence) === "weekly" ? "Weekly" : "Monthly";
}

export function normalizeCadence(cadence: ReportCadence): Exclude<ReportCadence, "all_time"> {
  return cadence === "weekly" ? "weekly" : "monthly";
}

export function buildReportDeliveryPayload(draft: ReportDeliveryDraft) {
  return {
    deliveryDetailLevel: draft.deliveryDetailLevel,
    includeOutageSummary: draft.includeOutageSummary,
    includeMonitorBreakdown: draft.includeMonitorBreakdown,
    emailSubjectTemplate: draft.emailSubjectTemplate.trim() || null,
    emailIntroTemplate: draft.emailIntroTemplate.trim() || null,
    reportBrandName: draft.reportBrandName.trim() || null,
  };
}

export function buildSchedulePackageLabel(schedule: ReportScheduleRecord) {
  return `${schedule.deliveryDetailLevel} / HTML`;
}

export function getScheduleDeliveryStatusLabel(schedule: ReportScheduleRecord) {
  if (schedule.lastStatus === "running") {
    return schedule.lastRunAt
      ? `Sending since ${new Date(schedule.lastRunAt).toLocaleString()}`
      : "Sending";
  }

  if (schedule.lastStatus === "delivered") {
    return schedule.lastDeliveredAt
      ? `Delivered at ${new Date(schedule.lastDeliveredAt).toLocaleString()}`
      : "Delivered";
  }

  if (schedule.lastStatus === "failed") {
    return schedule.lastRunAt
      ? `Failed at ${new Date(schedule.lastRunAt).toLocaleString()}`
      : "Failed";
  }

  return "Not sent yet";
}

export function parseRecipients(value: string) {
  return Array.from(new Set(value.split(/[\n,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

export function toLocalDateTime(value: string) {
  const date = new Date(value);
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
