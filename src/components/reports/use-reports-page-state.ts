"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { showToast, type ToastTone } from "@/lib/client-toast";
import type { CompanyRecord } from "@/lib/companies/types";
import type { GeneratedReport, ReportScheduleRecord } from "@/lib/reports/types";
import {
  createReportSchedule,
  deleteReportSchedule,
  duplicateReportSchedule,
  exportReportPreview,
  generateReportPreview,
  loadReportSchedule,
  sendReportPreview,
  sendScheduledReport,
  toggleReportSchedule,
} from "@/components/reports/reports-page-actions";
import {
  buildScheduleName,
  EMPTY_REPORT_DRAFT,
  EMPTY_SCHEDULE_DRAFT,
  filterSchedules,
  parseRecipients,
  type DeliveryResult,
  type DraftReport,
  type DraftSchedule,
  type ScheduleFilter,
} from "@/components/reports/reports-page-model";

type Setter<T> = Dispatch<SetStateAction<T>>;
type Notice = { text: string; tone: ToastTone } | null;
type ReportsResponse = { schedules?: ReportScheduleRecord[]; message?: string };

function useReportNotice() {
  const [message, setMessage] = useState<Notice>(null);
  const notify = useCallback((text: string, tone: ToastTone) => {
    setMessage({ text, tone });
    showToast(text, tone);
  }, []);
  return { message, notify, setMessage };
}

function useReportsCatalog(setMessage: Setter<Notice>) {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [schedules, setSchedules] = useState<ReportScheduleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const refreshPage = useCallback(async (options: { clearMessage?: boolean } = {}) => {
    setLoading(true);
    try {
      const [reportsResponse, companiesResponse] = await Promise.all([
        fetch("/api/reports", { cache: "no-store" }),
        fetch("/api/companies", { cache: "no-store" }),
      ]);
      const reportsData = (await reportsResponse.json()) as ReportsResponse;
      const companiesData = (await companiesResponse.json()) as { companies?: CompanyRecord[]; message?: string };
      if (!reportsResponse.ok) throw new Error(reportsData.message ?? "Unable to load report schedules.");
      if (!companiesResponse.ok) throw new Error(companiesData.message ?? "Unable to load companies.");
      setSchedules(reportsData.schedules ?? []);
      setCompanies(companiesData.companies ?? []);
      if (options.clearMessage !== false) setMessage(null);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unable to load reports.";
      setMessage({ text, tone: "error" });
      showToast(text, "error");
    } finally {
      setLoading(false);
    }
  }, [setMessage]);

  useEffect(() => void refreshPage(), [refreshPage]);
  return { companies, loading, refreshPage, schedules, setSchedules };
}

function useReportsActiveTab() {
  const [activeTab, setActiveTab] = useState<"preview" | "schedules">("preview");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    if (mode !== "schedules" && mode !== "preview") return;
    const frameId = window.requestAnimationFrame(() => setActiveTab(mode));
    return () => window.cancelAnimationFrame(frameId);
  }, []);
  return { activeTab, setActiveTab };
}

function useScheduleWorkspace(companies: CompanyRecord[], schedules: ReportScheduleRecord[]) {
  const [scheduleDraft, setScheduleDraftState] = useState<DraftSchedule>(EMPTY_SCHEDULE_DRAFT);
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>("all");
  const [scheduleToDelete, setScheduleToDelete] = useState<ReportScheduleRecord | null>(null);
  const filteredSchedules = useMemo(
    () => filterSchedules(schedules, scheduleSearch, scheduleFilter),
    [scheduleFilter, scheduleSearch, schedules]
  );
  const activeSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.isActive)
      .sort((left, right) => new Date(left.nextRunAt).getTime() - new Date(right.nextRunAt).getTime()),
    [schedules]
  );
  const setScheduleDraft = useCallback<Setter<DraftSchedule>>((update) => {
    setScheduleDraftState((current) => {
      const next = typeof update === "function" ? update(current) : update;
      const namingScopeChanged = next.scope !== current.scope
        || next.cadence !== current.cadence
        || next.companyId !== current.companyId;
      return namingScopeChanged
        ? { ...next, name: buildScheduleName(next.scope, next.cadence, next.companyId, companies) }
        : next;
    });
  }, [companies]);
  return {
    activeSchedules, filteredSchedules, scheduleDraft, scheduleFilter, scheduleSearch, scheduleToDelete,
    setScheduleDraft, setScheduleFilter, setScheduleSearch, setScheduleToDelete,
  };
}

type ReportsActionContext = {
  activeTab: ReturnType<typeof useReportsActiveTab>;
  catalog: ReturnType<typeof useReportsCatalog>;
  notify: (message: string, tone: ToastTone) => void;
  preview: GeneratedReport | null;
  previewDraft: DraftReport;
  schedule: ReturnType<typeof useScheduleWorkspace>;
  setLastDeliveryResult: Setter<DeliveryResult | null>;
  setPreview: Setter<GeneratedReport | null>;
  setSaving: Setter<boolean>;
};

function buildReportsPageActions(context: ReportsActionContext) {
  const base = { notify: context.notify, setSaving: context.setSaving };
  const previewRuntime = { ...base, setLastDeliveryResult: context.setLastDeliveryResult, setPreview: context.setPreview };
  const scheduleRuntime = { ...base, setSchedules: context.catalog.setSchedules };
  return {
    createSchedule: () => createReportSchedule(context.schedule.scheduleDraft, {
      ...scheduleRuntime,
      setActiveTab: context.activeTab.setActiveTab,
      setScheduleDraft: context.schedule.setScheduleDraft,
    }),
    deleteSchedule: (id: string) => deleteReportSchedule(id, scheduleRuntime),
    duplicateSchedule: (item: ReportScheduleRecord) => duplicateReportSchedule(item, scheduleRuntime),
    exportPreviewHtml: () => exportReportPreview(context.preview),
    generatePreview: () => generateReportPreview(context.previewDraft, previewRuntime),
    loadScheduleIntoBuilder: (item: ReportScheduleRecord) => loadReportSchedule(
      item,
      context.schedule.setScheduleDraft,
      context.activeTab.setActiveTab
    ),
    sendPreviewNow: () => sendReportPreview(context.previewDraft, previewRuntime),
    sendScheduleNow: (id: string) => sendScheduledReport(id, {
      ...scheduleRuntime,
      refreshPage: context.catalog.refreshPage,
      setLastDeliveryResult: context.setLastDeliveryResult,
    }),
    toggleSchedule: (item: ReportScheduleRecord) => toggleReportSchedule(item, scheduleRuntime),
  };
}

export function useReportsPageState() {
  const notice = useReportNotice();
  const catalog = useReportsCatalog(notice.setMessage);
  const activeTab = useReportsActiveTab();
  const schedule = useScheduleWorkspace(catalog.companies, catalog.schedules);
  const [previewDraft, setPreviewDraft] = useState<DraftReport>(EMPTY_REPORT_DRAFT);
  const [preview, setPreview] = useState<GeneratedReport | null>(null);
  const [lastDeliveryResult, setLastDeliveryResult] = useState<DeliveryResult | null>(null);
  const [saving, setSaving] = useState(false);
  const actions = buildReportsPageActions({
    activeTab, catalog, notify: notice.notify, preview, previewDraft, schedule,
    setLastDeliveryResult, setPreview, setSaving,
  });
  return {
    ...actions,
    ...schedule,
    activeTab: activeTab.activeTab,
    companies: catalog.companies,
    lastDeliveryResult,
    loading: catalog.loading,
    message: notice.message,
    preview,
    previewDraft,
    previewNeedsCompany: previewDraft.scope === "company" && !previewDraft.companyId,
    previewNeedsPeriod: previewDraft.periodRange === "custom" && (
      !previewDraft.periodStartedAt
      || !previewDraft.periodEndedAt
      || previewDraft.periodStartedAt > previewDraft.periodEndedAt
    ),
    previewRecipients: parseRecipients(previewDraft.recipients),
    saving,
    scheduleNeedsCompany: schedule.scheduleDraft.scope === "company" && !schedule.scheduleDraft.companyId,
    scheduleRecipients: parseRecipients(schedule.scheduleDraft.recipients),
    setActiveTab: activeTab.setActiveTab,
    setLastDeliveryResult,
    setPreview,
    setPreviewDraft,
  };
}
