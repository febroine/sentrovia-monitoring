import type { Dispatch, SetStateAction } from "react";
import type { ToastTone } from "@/lib/client-toast";
import type { GeneratedReport, ReportScheduleRecord } from "@/lib/reports/types";
import { buildPrintableReportHtml, buildReportFileSlug } from "@/lib/reports/export";
import {
  buildReportDeliveryPayload,
  buildReportPeriodPayload,
  downloadFile,
  EMPTY_SCHEDULE_DRAFT,
  normalizeCadence,
  parseRecipients,
  toLocalDateTime,
  type DeliveryResult,
  type DraftReport,
  type DraftSchedule,
  type ReportsTab,
} from "@/components/reports/reports-page-model";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Notify = (message: string, tone: ToastTone) => void;
type ActionRuntime = { notify: Notify; setSaving: Setter<boolean> };
type PreviewActionRuntime = ActionRuntime & {
  isCurrent?: () => boolean;
  setLastDeliveryResult: Setter<DeliveryResult | null>;
  setPreview: Setter<GeneratedReport | null>;
};

export async function generateReportPreview(
  draft: DraftReport,
  runtime: PreviewActionRuntime
) {
  runtime.setSaving(true);
  runtime.setLastDeliveryResult(null);
  try {
    const response = await fetch("/api/reports/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: draft.scope,
        cadence: draft.cadence,
        template: draft.template,
        companyId: draft.scope === "company" ? draft.companyId : null,
        monitorIds: draft.monitorIds,
        excludeMonitorIds: draft.excludeMonitorIds,
        excludeTags: draft.excludeTags,
        excludeCompanyIds: draft.excludeCompanyIds,
        ...buildReportPeriodPayload(draft),
        ...buildReportDeliveryPayload(draft),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { report?: GeneratedReport; message?: string };
    if (!response.ok || !data.report) throw new Error(data.message ?? "Unable to generate the report preview.");
    if (runtime.isCurrent?.() === false) return;
    runtime.setPreview(data.report);
    runtime.notify("Report preview updated.", "success");
  } catch (error) {
    if (runtime.isCurrent?.() === false) return;
    runtime.notify(error instanceof Error ? error.message : "Unable to generate the report preview.", "error");
  } finally {
    runtime.setSaving(false);
  }
}

export async function sendReportPreview(
  draft: DraftReport,
  runtime: PreviewActionRuntime
) {
  runtime.setSaving(true);
  try {
    const recipients = parseRecipients(draft.recipients);
    const response = await fetch("/api/reports/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: draft.scope,
        cadence: draft.cadence,
        template: draft.template,
        companyId: draft.scope === "company" ? draft.companyId : null,
        monitorIds: draft.monitorIds,
        excludeMonitorIds: draft.excludeMonitorIds,
        excludeTags: draft.excludeTags,
        excludeCompanyIds: draft.excludeCompanyIds,
        recipientEmails: recipients,
        ...buildReportPeriodPayload(draft),
        ...buildReportDeliveryPayload(draft),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
      report?: GeneratedReport;
      delivery?: { status?: string; deliveredAt?: string | null } | null;
    };
    if (!response.ok || !data.report || data.delivery?.status !== "delivered") {
      throw new Error(data.message ?? "Unable to send the report.");
    }
    if (runtime.isCurrent?.() === false) return;
    runtime.setPreview(data.report);
    runtime.setLastDeliveryResult({
      status: data.delivery.status,
      deliveredAt: data.delivery.deliveredAt ?? null,
      reportTitle: data.report.title,
      recipients,
    });
    runtime.notify("Report sent successfully with an HTML attachment.", "success");
  } catch (error) {
    if (runtime.isCurrent?.() === false) return;
    runtime.notify(error instanceof Error ? error.message : "Unable to send the report.", "error");
  } finally {
    runtime.setSaving(false);
  }
}

function buildScheduleRequestBody(draft: DraftSchedule) {
  return JSON.stringify({
    name: draft.name,
    scope: draft.scope,
    cadence: draft.cadence,
    template: draft.template,
    companyId: draft.scope === "company" ? draft.companyId : null,
    recipientEmails: parseRecipients(draft.recipients),
    isActive: draft.isActive,
    nextRunAt: draft.nextRunAt ? new Date(draft.nextRunAt).toISOString() : null,
    ...buildReportDeliveryPayload(draft),
  });
}

// Saves the builder over the schedule it was loaded from, instead of creating a second one.
export async function updateReportScheduleFromDraft(
  id: string,
  draft: DraftSchedule,
  runtime: ActionRuntime & {
    setScheduleDraft: Setter<DraftSchedule>;
    setSchedules: Setter<ReportScheduleRecord[]>;
    setEditingScheduleId: Setter<string | null>;
  }
) {
  runtime.setSaving(true);
  try {
    const response = await fetch(`/api/reports/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: buildScheduleRequestBody(draft),
    });
    const data = (await response.json().catch(() => ({}))) as { schedule?: ReportScheduleRecord; message?: string };
    if (!response.ok || !data.schedule) throw new Error(data.message ?? "Unable to save the report schedule.");
    runtime.setSchedules((current) => current.map((schedule) => (schedule.id === id ? data.schedule! : schedule)));
    runtime.setScheduleDraft(EMPTY_SCHEDULE_DRAFT);
    runtime.setEditingScheduleId(null);
    runtime.notify("Report schedule saved.", "success");
  } catch (error) {
    runtime.notify(error instanceof Error ? error.message : "Unable to save the report schedule.", "error");
  } finally {
    runtime.setSaving(false);
  }
}

export async function createReportSchedule(
  draft: DraftSchedule,
  runtime: ActionRuntime & {
    setActiveTab: Setter<ReportsTab>;
    setScheduleDraft: Setter<DraftSchedule>;
    setSchedules: Setter<ReportScheduleRecord[]>;
  }
) {
  runtime.setSaving(true);
  try {
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: buildScheduleRequestBody(draft),
    });
    const data = (await response.json().catch(() => ({}))) as { schedule?: ReportScheduleRecord; message?: string };
    if (!response.ok || !data.schedule) throw new Error(data.message ?? "Unable to create the report schedule.");
    runtime.setSchedules((current) => [data.schedule!, ...current]);
    runtime.setScheduleDraft(EMPTY_SCHEDULE_DRAFT);
    runtime.notify("Report schedule created.", "success");
    runtime.setActiveTab("schedules");
  } catch (error) {
    runtime.notify(error instanceof Error ? error.message : "Unable to create the report schedule.", "error");
  } finally {
    runtime.setSaving(false);
  }
}

export async function toggleReportSchedule(
  schedule: ReportScheduleRecord,
  runtime: ActionRuntime & { setSchedules: Setter<ReportScheduleRecord[]> }
) {
  runtime.setSaving(true);
  try {
    const response = await fetch(`/api/reports/${schedule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !schedule.isActive }),
    });
    const data = (await response.json().catch(() => ({}))) as { schedule?: ReportScheduleRecord; message?: string };
    if (!response.ok || !data.schedule) throw new Error(data.message ?? "Unable to update the report schedule.");
    runtime.setSchedules((current) => current.map((item) => (item.id === schedule.id ? data.schedule! : item)));
    runtime.notify("Report schedule updated.", "success");
  } catch (error) {
    runtime.notify(error instanceof Error ? error.message : "Unable to update the report schedule.", "error");
  } finally {
    runtime.setSaving(false);
  }
}

export async function sendScheduledReport(
  scheduleId: string,
  runtime: ActionRuntime & {
    refreshPage: (options?: { clearMessage?: boolean }) => Promise<void>;
    setLastDeliveryResult: Setter<DeliveryResult | null>;
    setSchedules: Setter<ReportScheduleRecord[]>;
  }
) {
  runtime.setSaving(true);
  try {
    const response = await fetch(`/api/reports/${scheduleId}/send`, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
      report?: GeneratedReport | null;
      delivery?: { status?: string; deliveredAt?: string | null } | null;
      schedule?: ReportScheduleRecord;
    };
    if (data.schedule) {
      runtime.setSchedules((current) => current.map((item) => (item.id === data.schedule?.id ? data.schedule : item)));
    }
    if (!response.ok || !data.schedule || !data.report || data.delivery?.status !== "delivered") {
      throw new Error(data.message ?? "Unable to send the scheduled report.");
    }
    runtime.setLastDeliveryResult({
      status: data.delivery.status,
      deliveredAt: data.delivery.deliveredAt ?? null,
      reportTitle: data.report.title,
      recipients: data.schedule.recipientEmails,
    });
    runtime.notify("Scheduled report sent successfully.", "success");
  } catch (error) {
    runtime.notify(error instanceof Error ? error.message : "Unable to send the scheduled report.", "error");
    await runtime.refreshPage({ clearMessage: false });
  } finally {
    runtime.setSaving(false);
  }
}

export async function duplicateReportSchedule(
  schedule: ReportScheduleRecord,
  runtime: ActionRuntime & { setSchedules: Setter<ReportScheduleRecord[]> }
) {
  runtime.setSaving(true);
  try {
    const response = await fetch(`/api/reports/${schedule.id}/duplicate`, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { schedule?: ReportScheduleRecord; message?: string };
    if (!response.ok || !data.schedule) {
      throw new Error(data.message ?? "Unable to duplicate the report schedule.");
    }
    runtime.setSchedules((current) => [data.schedule!, ...current]);
    runtime.notify("Report schedule duplicated as a paused copy.", "success");
  } catch (error) {
    runtime.notify(error instanceof Error ? error.message : "Unable to duplicate the report schedule.", "error");
  } finally {
    runtime.setSaving(false);
  }
}

export async function deleteReportSchedule(
  scheduleId: string,
  runtime: ActionRuntime & { setSchedules: Setter<ReportScheduleRecord[]> }
) {
  runtime.setSaving(true);
  try {
    const response = await fetch(`/api/reports/${scheduleId}`, { method: "DELETE" });
    const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok || !data.id) throw new Error(data.message ?? "Unable to delete the report schedule.");
    runtime.setSchedules((current) => current.filter((schedule) => schedule.id !== data.id));
    runtime.notify("Report schedule deleted.", "success");
  } catch (error) {
    runtime.notify(error instanceof Error ? error.message : "Unable to delete the report schedule.", "error");
  } finally {
    runtime.setSaving(false);
  }
}

export function loadReportSchedule(
  schedule: ReportScheduleRecord,
  setScheduleDraft: Setter<DraftSchedule>,
  setActiveTab: Setter<ReportsTab>,
  setEditingScheduleId: Setter<string | null>
) {
  setEditingScheduleId(schedule.id);
  setScheduleDraft({
    name: schedule.name,
    scope: schedule.scope,
    cadence: normalizeCadence(schedule.cadence),
    template: schedule.template,
    companyId: schedule.companyId ?? "",
    recipients: schedule.recipientEmails.join(", "),
    nextRunAt: toLocalDateTime(schedule.nextRunAt),
    isActive: schedule.isActive,
    deliveryDetailLevel: schedule.deliveryDetailLevel,
    includeOutageSummary: schedule.includeOutageSummary,
    includeMonitorBreakdown: schedule.includeMonitorBreakdown,
    emailSubjectTemplate: schedule.emailSubjectTemplate ?? "",
    emailIntroTemplate: schedule.emailIntroTemplate ?? "",
    reportBrandName: schedule.reportBrandName ?? "",
  });
  setActiveTab("schedules");
}

export function exportReportPreview(preview: GeneratedReport | null) {
  if (!preview) return;
  downloadFile(buildPrintableReportHtml(preview), `${buildReportFileSlug(preview)}.html`, "text/html;charset=utf-8");
}
