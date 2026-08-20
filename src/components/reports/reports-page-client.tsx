"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Download,
  Search,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TemplateEditor } from "@/components/settings/template-editor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CompanyRecord } from "@/lib/companies/types";
import { buildPrintableReportHtml, buildReportFileSlug } from "@/lib/reports/export";
import { showToast, type ToastTone } from "@/lib/client-toast";
import type {
  GeneratedReport,
  ReportCadence,
  ReportScheduleRecord,
  ReportScope,
  ReportTemplateVariant,
} from "@/lib/reports/types";

type ReportsResponse = { schedules?: ReportScheduleRecord[]; message?: string };
type PreviewResponse = { report?: GeneratedReport; message?: string };
type ScheduleFilter = "all" | "active" | "paused" | "failed";
type DeliveryResult = {
  status: string;
  deliveredAt: string | null;
  reportTitle: string;
  recipients: string[];
};

type DraftReport = {
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
};

type DraftSchedule = {
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

const EMPTY_REPORT_DRAFT: DraftReport = {
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
};

const EMPTY_SCHEDULE_DRAFT: DraftSchedule = {
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

const CADENCE_OPTIONS: Array<{ value: ReportCadence; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "all_time", label: "All time" },
];

const TEMPLATE_OPTIONS: Array<{
  value: ReportTemplateVariant;
  label: string;
  detail: string;
}> = [
  {
    value: "operations",
    label: "Operations",
    detail: "Detailed runtime language for operators and support teams.",
  },
  {
    value: "executive",
    label: "Executive",
    detail: "Condensed summary focused on uptime, risk, and leadership visibility.",
  },
  {
    value: "client",
    label: "Client",
    detail: "Customer-friendly wording that keeps technical noise low.",
  },
];

export default function ReportsPageClient() {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [schedules, setSchedules] = useState<ReportScheduleRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"preview" | "schedules">("preview");
  const [previewDraft, setPreviewDraft] = useState<DraftReport>(EMPTY_REPORT_DRAFT);
  const [scheduleDraft, setScheduleDraft] = useState<DraftSchedule>(EMPTY_SCHEDULE_DRAFT);
  const [preview, setPreview] = useState<GeneratedReport | null>(null);
  const [lastDeliveryResult, setLastDeliveryResult] = useState<DeliveryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: ToastTone } | null>(null);
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>("all");
  const [scheduleToDelete, setScheduleToDelete] = useState<ReportScheduleRecord | null>(null);

  function notify(message: string, tone: ToastTone) {
    setMessage({ text: message, tone });
    showToast(message, tone);
  }

  const filteredSchedules = useMemo(
    () => filterSchedules(schedules, scheduleSearch, scheduleFilter),
    [scheduleFilter, scheduleSearch, schedules]
  );
  const activeSchedules = useMemo(
    () =>
      schedules
        .filter((schedule) => schedule.isActive)
        .sort((left, right) => new Date(left.nextRunAt).getTime() - new Date(right.nextRunAt).getTime()),
    [schedules]
  );

  const refreshPage = useCallback(async (options: { clearMessage?: boolean } = {}) => {
    setLoading(true);

    try {
      const [reportsResponse, companiesResponse] = await Promise.all([
        fetch("/api/reports", { cache: "no-store" }),
        fetch("/api/companies", { cache: "no-store" }),
      ]);
      const reportsData = (await reportsResponse.json()) as ReportsResponse;
      const companiesData = (await companiesResponse.json()) as {
        companies?: CompanyRecord[];
        message?: string;
      };

      if (!reportsResponse.ok) {
        throw new Error(reportsData.message ?? "Unable to load report schedules.");
      }

      if (!companiesResponse.ok) {
        throw new Error(companiesData.message ?? "Unable to load companies.");
      }

      setSchedules(reportsData.schedules ?? []);
      setCompanies(companiesData.companies ?? []);
      if (options.clearMessage !== false) {
        setMessage(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load reports.";
      setMessage({ text: message, tone: "error" });
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPage();
  }, [refreshPage]);

  useEffect(() => {
    const search = typeof window === "undefined" ? "" : window.location.search;
    const params = new URLSearchParams(search);
    const mode = params.get("mode");

    if (mode === "schedules" || mode === "preview") {
      const frameId = window.requestAnimationFrame(() => setActiveTab(mode));
      return () => window.cancelAnimationFrame(frameId);
    }
  }, []);

  useEffect(() => {
    setScheduleDraft((current) => ({
      ...current,
      name: buildScheduleName(current.scope, current.cadence, current.companyId, companies),
    }));
  }, [companies, scheduleDraft.cadence, scheduleDraft.companyId, scheduleDraft.scope]);

  async function generatePreview() {
    setSaving(true);
    setLastDeliveryResult(null);

    try {
      const response = await fetch("/api/reports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: previewDraft.scope,
          cadence: previewDraft.cadence,
          template: previewDraft.template,
          companyId: previewDraft.scope === "company" ? previewDraft.companyId : null,
          ...buildReportDeliveryPayload(previewDraft),
        }),
      });
      const data = (await response.json()) as PreviewResponse;

      if (!response.ok || !data.report) {
        throw new Error(data.message ?? "Unable to generate the report preview.");
      }

      setPreview(data.report);
      notify("Report preview updated.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to generate the report preview.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function sendPreviewNow() {
    setSaving(true);

    try {
      const response = await fetch("/api/reports/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: previewDraft.scope,
          cadence: previewDraft.cadence,
          template: previewDraft.template,
          companyId: previewDraft.scope === "company" ? previewDraft.companyId : null,
          recipientEmails: parseRecipients(previewDraft.recipients),
          ...buildReportDeliveryPayload(previewDraft),
        }),
      });
      const data = (await response.json()) as {
        message?: string;
        report?: GeneratedReport;
        delivery?: { status?: string; deliveredAt?: string | null } | null;
      };

      if (!response.ok || !data.report || data.delivery?.status !== "delivered") {
        throw new Error(data.message ?? "Unable to send the report.");
      }

      setPreview(data.report);

      setLastDeliveryResult({
        status: data.delivery.status,
        deliveredAt: data.delivery.deliveredAt ?? null,
        reportTitle: data.report.title,
        recipients: parseRecipients(previewDraft.recipients),
      });
      notify("Report sent successfully with an HTML attachment.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to send the report.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function createSchedule() {
    setSaving(true);

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: scheduleDraft.name,
          scope: scheduleDraft.scope,
          cadence: scheduleDraft.cadence,
          template: scheduleDraft.template,
          companyId: scheduleDraft.scope === "company" ? scheduleDraft.companyId : null,
          recipientEmails: parseRecipients(scheduleDraft.recipients),
          isActive: scheduleDraft.isActive,
          nextRunAt: scheduleDraft.nextRunAt ? new Date(scheduleDraft.nextRunAt).toISOString() : null,
          ...buildReportDeliveryPayload(scheduleDraft),
        }),
      });
      const data = (await response.json()) as { schedule?: ReportScheduleRecord; message?: string };

      if (!response.ok || !data.schedule) {
        throw new Error(data.message ?? "Unable to create the report schedule.");
      }

      setSchedules((current) => [data.schedule!, ...current]);
      setScheduleDraft(EMPTY_SCHEDULE_DRAFT);
      notify("Report schedule created.", "success");
      setActiveTab("schedules");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to create the report schedule.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleSchedule(schedule: ReportScheduleRecord) {
    setSaving(true);

    try {
      const response = await fetch(`/api/reports/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !schedule.isActive }),
      });
      const data = (await response.json()) as { schedule?: ReportScheduleRecord; message?: string };

      if (!response.ok || !data.schedule) {
        throw new Error(data.message ?? "Unable to update the report schedule.");
      }

      setSchedules((current) =>
        current.map((item) => (item.id === schedule.id ? data.schedule! : item))
      );
      notify("Report schedule updated.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to update the report schedule.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function sendScheduleNow(scheduleId: string) {
    setSaving(true);

    try {
      const response = await fetch(`/api/reports/${scheduleId}/send`, { method: "POST" });
      const data = (await response.json()) as {
        message?: string;
        report?: GeneratedReport | null;
        delivery?: { status?: string; deliveredAt?: string | null } | null;
        schedule?: ReportScheduleRecord;
      };

      if (data.schedule) {
        setSchedules((current) =>
          current.map((schedule) => (schedule.id === data.schedule?.id ? data.schedule : schedule))
        );
      }
      if (!response.ok || !data.schedule || !data.report || data.delivery?.status !== "delivered") {
        throw new Error(data.message ?? "Unable to send the scheduled report.");
      }

      setLastDeliveryResult({
        status: data.delivery.status,
        deliveredAt: data.delivery.deliveredAt ?? null,
        reportTitle: data.report.title,
        recipients: data.schedule.recipientEmails,
      });
      notify("Scheduled report sent successfully.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to send the scheduled report.", "error");
      await refreshPage({ clearMessage: false });
    } finally {
      setSaving(false);
    }
  }

  async function duplicateSchedule(schedule: ReportScheduleRecord) {
    setSaving(true);

    try {
      const response = await fetch(`/api/reports/${schedule.id}/duplicate`, { method: "POST" });
      const data = (await response.json()) as { schedule?: ReportScheduleRecord; message?: string };

      if (!response.ok || !data.schedule) {
        throw new Error(data.message ?? "Unable to duplicate the report schedule.");
      }

      setSchedules((current) => [data.schedule!, ...current]);
      notify("Report schedule duplicated as a paused copy.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to duplicate the report schedule.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSchedule(scheduleId: string) {
    setSaving(true);

    try {
      const response = await fetch(`/api/reports/${scheduleId}`, { method: "DELETE" });
      const data = (await response.json()) as { id?: string; message?: string };

      if (!response.ok || !data.id) {
        throw new Error(data.message ?? "Unable to delete the report schedule.");
      }

      setSchedules((current) => current.filter((schedule) => schedule.id !== data.id));
      notify("Report schedule deleted.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to delete the report schedule.", "error");
    } finally {
      setSaving(false);
    }
  }

  function applyPreviewPreset(
    scope: ReportScope,
    cadence: ReportCadence,
    template: ReportTemplateVariant
  ) {
    setPreviewDraft((current) => ({
      ...current,
      scope,
      cadence,
      template,
      companyId: scope === "global" ? "" : current.companyId,
    }));
    setActiveTab("preview");
  }

  function loadScheduleIntoBuilder(schedule: ReportScheduleRecord) {
    setScheduleDraft({
      name: schedule.name,
      scope: schedule.scope,
      cadence: schedule.cadence,
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

  function exportPreviewHtml() {
    if (!preview) {
      return;
    }

    downloadFile(buildPrintableReportHtml(preview), `${buildReportFileSlug(preview)}.html`, "text/html;charset=utf-8");
  }

  const previewRecipients = parseRecipients(previewDraft.recipients);
  const scheduleRecipients = parseRecipients(scheduleDraft.recipients);
  const previewNeedsCompany = previewDraft.scope === "company" && !previewDraft.companyId;
  const scheduleNeedsCompany = scheduleDraft.scope === "company" && !scheduleDraft.companyId;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Preview HTML reports, schedule recurring delivery, and review existing report plans.
          </p>
        </div>
        <p className="text-sm text-muted-foreground md:text-right">
          Next delivery: {activeSchedules[0] ? new Date(activeSchedules[0].nextRunAt).toLocaleString() : "No active schedule"}
        </p>
      </header>

      {message ? (
        <div
          role={message.tone === "error" ? "alert" : "status"}
          className={cn(
            "border-l-2 px-4 py-2 text-sm",
            message.tone === "error" && "border-destructive text-destructive",
            message.tone === "success" && "border-emerald-500",
            message.tone === "info" && "border-border"
          )}
        >
          {message.text}
        </div>
      ) : null}

      <div className="inline-flex w-full rounded-md border bg-muted/30 p-1 sm:w-auto">
        <ReportModeButton active={activeTab === "preview"} title="Preview" onClick={() => setActiveTab("preview")} />
        <ReportModeButton active={activeTab === "schedules"} title="Schedules" onClick={() => setActiveTab("schedules")} />
      </div>

      <div className="space-y-4">
          {activeTab === "preview" ? (
            <>
          <Card className="overflow-hidden border-border/70">
            <CardHeader className="border-b pb-4">
              <CardTitle>Generate manual report</CardTitle>
              <CardDescription>
                Preview a report instantly or send it to a hand-picked recipient list.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Scope">
                  <Select
                    value={previewDraft.scope}
                    onValueChange={(value) =>
                      setPreviewDraft((current) => ({
                        ...current,
                        scope: value as ReportScope,
                        companyId: value === "global" ? "" : current.companyId,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Global workspace</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Cadence">
                  <Select
                    value={previewDraft.cadence}
                    onValueChange={(value) =>
                      setPreviewDraft((current) => ({ ...current, cadence: value as ReportCadence }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CADENCE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                {previewDraft.scope === "company" ? (
                  <Field label="Company">
                    <Select value={previewDraft.companyId} onValueChange={(value) => setPreviewDraft((current) => ({ ...current, companyId: String(value) }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select company" />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map((company) => (
                          <SelectItem key={company.id} value={company.id}>
                            {company.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : (
                  <InfoTile title="Coverage" detail="Global reports combine every monitor in the workspace into one overview." />
                )}

                <Field label="Recipients">
                  <Textarea
                    rows={3}
                    value={previewDraft.recipients}
                    onChange={(event) => setPreviewDraft((current) => ({ ...current, recipients: event.target.value }))}
                    placeholder="alerts@company.com, ops@company.com"
                  />
                </Field>
              </div>

              <ReportOptionsPanel
                template={previewDraft.template}
                draft={previewDraft}
                subjectTitle={buildScheduleName(previewDraft.scope, previewDraft.cadence, previewDraft.companyId, companies)}
                subjectScope={resolveDraftScopeLabel(previewDraft, companies)}
                subjectPeriod={resolveDraftPeriodLabel(previewDraft.cadence)}
                onTemplateChange={(template) => setPreviewDraft((current) => ({ ...current, template }))}
                onChange={(patch) => setPreviewDraft((current) => ({ ...current, ...patch }))}
              />

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void generatePreview()} disabled={saving || previewNeedsCompany}>
                  {saving ? "Generating..." : "Generate Preview"}
                </Button>
                <Button variant="outline" onClick={() => void sendPreviewNow()} disabled={saving || previewNeedsCompany || previewRecipients.length === 0}>
                  <Send className="mr-2 h-4 w-4" />
                  Send Now
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPreviewDraft(EMPTY_REPORT_DRAFT);
                    setPreview(null);
                    setLastDeliveryResult(null);
                  }}
                  disabled={saving}
                >
                  Reset
                </Button>
              </div>

              <RecipientHint count={previewRecipients.length} />
            </CardContent>
          </Card>

          {lastDeliveryResult ? <DeliveryResultCard delivery={lastDeliveryResult} /> : null}
          {preview ? (
            <ReportPreviewPanel
              report={preview}
              onExportHtml={exportPreviewHtml}
            />
          ) : (
            <BuilderEmptyState
              title="No report preview yet"
              description="Choose the report settings, then generate a preview before sending it."
              actionLabel="Use weekly workspace preset"
              onAction={() => applyPreviewPreset("global", "weekly", "operations")}
            />
          )}
            </>
          ) : (
            <>
          <Card className="overflow-hidden border-border/70">
            <CardHeader className="border-b pb-4">
              <CardTitle>Create scheduled report</CardTitle>
              <CardDescription>
                Save a recurring schedule, keep the same recipient list, and let the worker deliver it automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Schedule name">
                  <Input value={scheduleDraft.name} onChange={(event) => setScheduleDraft((current) => ({ ...current, name: event.target.value }))} />
                </Field>

                <Field label="Scope">
                  <Select
                    value={scheduleDraft.scope}
                    onValueChange={(value) =>
                      setScheduleDraft((current) => ({
                        ...current,
                        scope: value as ReportScope,
                        companyId: value === "global" ? "" : current.companyId,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Global workspace</SelectItem>
                      <SelectItem value="company">Company</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Cadence">
                  <Select value={scheduleDraft.cadence} onValueChange={(value) => setScheduleDraft((current) => ({ ...current, cadence: value as ReportCadence }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CADENCE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                {scheduleDraft.scope === "company" ? (
                  <Field label="Company">
                    <Select value={scheduleDraft.companyId} onValueChange={(value) => setScheduleDraft((current) => ({ ...current, companyId: String(value) }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select company" />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map((company) => (
                          <SelectItem key={company.id} value={company.id}>
                            {company.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : (
                  <InfoTile title="Worker pickup" detail="Active schedules are collected automatically during the worker cycle." />
                )}
                
                <Field label="Recipients">
                  <Textarea
                    rows={3}
                    value={scheduleDraft.recipients}
                    onChange={(event) => setScheduleDraft((current) => ({ ...current, recipients: event.target.value }))}
                    placeholder="alerts@company.com, leadership@company.com"
                  />
                </Field>

                <Field label="First run">
                  <Input
                    type="datetime-local"
                    value={scheduleDraft.nextRunAt}
                    onChange={(event) => setScheduleDraft((current) => ({ ...current, nextRunAt: event.target.value }))}
                  />
                </Field>

                <div className="border-y py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Auto-send</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Pause the schedule now if you want to stage it before production use.
                      </p>
                    </div>
                    <Switch checked={scheduleDraft.isActive} onCheckedChange={(value) => setScheduleDraft((current) => ({ ...current, isActive: value }))} />
                  </div>
                </div>
              </div>

              <ReportOptionsPanel
                template={scheduleDraft.template}
                draft={scheduleDraft}
                subjectTitle={buildScheduleName(scheduleDraft.scope, scheduleDraft.cadence, scheduleDraft.companyId, companies)}
                subjectScope={resolveDraftScopeLabel(scheduleDraft, companies)}
                subjectPeriod={resolveDraftPeriodLabel(scheduleDraft.cadence)}
                onTemplateChange={(template) => setScheduleDraft((current) => ({ ...current, template }))}
                onChange={(patch) => setScheduleDraft((current) => ({ ...current, ...patch }))}
              />

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void createSchedule()} disabled={saving || scheduleNeedsCompany || scheduleRecipients.length === 0}>
                  {saving ? "Creating..." : "Create Schedule"}
                </Button>
                <Button variant="ghost" onClick={() => setScheduleDraft(EMPTY_SCHEDULE_DRAFT)} disabled={saving}>
                  Reset
                </Button>
              </div>

              <RecipientHint count={scheduleRecipients.length} />
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/70">
            <CardHeader className="border-b pb-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <CardTitle>Scheduled reports</CardTitle>
                  <CardDescription>
                    Search, filter, pause, send, or load any schedule back into the builder.
                  </CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative min-w-64">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input value={scheduleSearch} onChange={(event) => setScheduleSearch(event.target.value)} placeholder="Search schedule or recipient" className="pl-9" />
                  </div>
                  <Select value={scheduleFilter} onValueChange={(value) => setScheduleFilter(value as ScheduleFilter)}>
                    <SelectTrigger className="min-w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All schedules</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-5">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading report schedules...</p>
              ) : filteredSchedules.length === 0 ? (
                <BuilderEmptyState
                  title="No schedules match this view"
                  description="Adjust your filters or create a new recurring report from the builder on the left."
                />
              ) : (
                filteredSchedules.map((schedule) => (
                  <ScheduleCard
                    key={schedule.id}
                    schedule={schedule}
                    saving={saving}
                    onToggle={() => void toggleSchedule(schedule)}
                    onSendNow={() => void sendScheduleNow(schedule.id)}
                    onEdit={() => loadScheduleIntoBuilder(schedule)}
                    onDuplicate={() => void duplicateSchedule(schedule)}
                    onDelete={() => setScheduleToDelete(schedule)}
                  />
                ))
              )}
            </CardContent>
          </Card>
            </>
          )}
        </div>

      <Dialog open={scheduleToDelete !== null} onOpenChange={(open) => !open && setScheduleToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete report schedule?</DialogTitle>
            <DialogDescription>
              “{scheduleToDelete?.name}” will stop running and its schedule record will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleToDelete(null)} disabled={saving}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={saving || !scheduleToDelete}
              onClick={() => {
                if (!scheduleToDelete) return;
                const scheduleId = scheduleToDelete.id;
                setScheduleToDelete(null);
                void deleteSchedule(scheduleId);
              }}
            >
              Delete schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
  );
}

function ReportModeButton({
  active,
  title,
  onClick,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md px-4 py-2 text-center text-sm font-medium transition-colors sm:flex-none",
        active
          ? "bg-background text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {title}
    </button>
  );
}

function ReportOptionsPanel({
  template,
  draft,
  subjectTitle,
  subjectScope,
  subjectPeriod,
  onTemplateChange,
  onChange,
}: {
  template: ReportTemplateVariant;
  draft: ReportDeliveryDraft;
  subjectTitle: string;
  subjectScope: string;
  subjectPeriod: string;
  onTemplateChange: (template: ReportTemplateVariant) => void;
  onChange: (patch: Partial<ReportDeliveryDraft>) => void;
}) {
  return (
    <details open className="group border-y border-border/70">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-sm font-medium">Report options</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Template, report brand, email subject, included sections, and email copy
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t border-border/70 px-4 py-4">
        <TemplateStrip value={template} onChange={onTemplateChange} />
        <ReportDeliveryComposer
          template={template}
          draft={draft}
          subjectTitle={subjectTitle}
          subjectScope={subjectScope}
          subjectPeriod={subjectPeriod}
          onChange={onChange}
        />
      </div>
    </details>
  );
}

function TemplateStrip({
  value,
  onChange,
}: {
  value: ReportTemplateVariant;
  onChange: (template: ReportTemplateVariant) => void;
}) {
  return (
    <div className="grid border-y lg:grid-cols-3 lg:divide-x">
      {TEMPLATE_OPTIONS.map((template) => {
        const active = template.value === value;

        return (
          <button
            key={template.value}
            type="button"
            onClick={() => onChange(template.value)}
            className={cn(
              "border-b px-4 py-3 text-left transition-colors last:border-b-0 lg:border-b-0",
              active
                ? "bg-primary/5"
                : "hover:bg-muted/20"
            )}
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold">{template.label}</p>
              <p className="text-xs leading-5 text-muted-foreground">{template.detail}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

type ReportDeliveryDraft = Pick<
  DraftReport,
  | "deliveryDetailLevel"
  | "includeOutageSummary"
  | "includeMonitorBreakdown"
  | "emailSubjectTemplate"
  | "emailIntroTemplate"
  | "reportBrandName"
>;

function ReportDeliveryComposer({
  template,
  draft,
  subjectTitle,
  subjectScope,
  subjectPeriod,
  onChange,
}: {
  template: ReportTemplateVariant;
  draft: ReportDeliveryDraft;
  subjectTitle: string;
  subjectScope: string;
  subjectPeriod: string;
  onChange: (patch: Partial<ReportDeliveryDraft>) => void;
}) {
  const reportTypeLabel = template === "executive" ? "Executive Report" : template === "client" ? "Client Report" : "Operations Report";
  const reportBrand = draft.reportBrandName.trim() || "Sentrovia";
  const subjectPreview = buildDraftSubjectPreview(draft.emailSubjectTemplate, {
    brand: reportBrand,
    reportTypeLabel,
    title: subjectTitle,
    scope: subjectScope,
    period: subjectPeriod,
  });

  return (
    <div>
      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Field label="Detail level">
            <Select
              value={draft.deliveryDetailLevel}
              onValueChange={(value) =>
                onChange({ deliveryDetailLevel: value as ReportDeliveryDraft["deliveryDetailLevel"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">Summary</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="full">Full</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="divide-y border-y">
            <div className="border-l-2 border-border px-3 py-1">
              <p className="text-xs font-semibold">HTML delivery</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Scheduled and manual deliveries include one browser-ready HTML report.
              </p>
            </div>
            <CompactToggle
              label="Failures"
              checked={draft.includeOutageSummary}
              onChange={(includeOutageSummary) => onChange({ includeOutageSummary })}
            />
            <CompactToggle
              label="Breakdown"
              checked={draft.includeMonitorBreakdown}
              onChange={(includeMonitorBreakdown) => onChange({ includeMonitorBreakdown })}
            />
          </div>
        </div>
        <div className="space-y-4">
          <Field label="Brand / sender name">
            <Input
              value={draft.reportBrandName}
              onChange={(event) => onChange({ reportBrandName: event.target.value })}
              placeholder="Your organization"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Replaces Sentrovia in the email header, attached report, and default subject prefix.
            </p>
          </Field>
          <Field label="Email subject template">
            <Input
              value={draft.emailSubjectTemplate}
              onChange={(event) => onChange({ emailSubjectTemplate: event.target.value })}
              placeholder="[{brand} Report] {title} - {health_status}"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Leave blank to use the default subject. Add a template to replace the complete subject, including the report prefix.
            </p>
          </Field>
          <div className="border-l-2 border-sky-500 px-4 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
              Email subject preview
            </p>
            <p className="mt-1 break-words text-sm font-medium text-foreground">{subjectPreview}</p>
          </div>
          <TemplateEditor
            label="Email intro template"
            hint="Tokens: {title}, {brand}, {workspace}, {period}, {health_score}, {health_status}, {uptime}, {failure_rate}, {failures}, {down_now}, {p95_latency}"
            rows={4}
            value={draft.emailIntroTemplate}
            onChange={(emailIntroTemplate) => onChange({ emailIntroTemplate })}
          />
        </div>
      </div>
    </div>
  );
}

function buildDraftSubjectPreview(
  template: string,
  input: { brand: string; reportTypeLabel: string; title: string; scope: string; period: string }
) {
  const fallback = `[${input.brand} ${input.reportTypeLabel}] ${input.title}`;
  if (!template.trim()) {
    return fallback;
  }

  const replacements: Record<string, string> = {
    "{brand}": input.brand,
    "{workspace}": input.brand,
    "{title}": input.title,
    "{template}": input.reportTypeLabel,
    "{scope}": input.scope,
    "{period}": input.period,
    "{health_score}": "98",
    "{health_status}": "Excellent",
    "{uptime}": "99.95%",
    "{failure_rate}": "0.05%",
    "{failures}": "1",
    "{down_now}": "0",
    "{p95_latency}": "240ms",
  };

  return Object.entries(replacements).reduce(
    (subject, [token, value]) => subject.replaceAll(token, value),
    template.trim()
  );
}

function CompactToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-2">
      <span className="text-xs font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function BuilderEmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 border-y px-1 py-5">
        <div className="space-y-1">
          <p className="text-base font-semibold">{title}</p>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {actionLabel && onAction ? (
          <Button variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
    </div>
  );
}

function DeliveryResultCard({ delivery }: { delivery: DeliveryResult }) {
  return (
    <section className="border-y py-4">
      <div className="pb-3">
        <h2 className="text-base font-medium">Latest delivery result</h2>
        <p className="text-sm text-muted-foreground">
          Result from the most recent manual send.
        </p>
      </div>
      <div>
        <dl className="grid border-y md:grid-cols-2 xl:grid-cols-4 xl:divide-x">
        <DetailBlock label="Status" value={delivery.status} />
        <DetailBlock label="Report" value={delivery.reportTitle} />
        <DetailBlock
          label="Delivered"
          value={delivery.deliveredAt ? new Date(delivery.deliveredAt).toLocaleString() : "Waiting for timestamp"}
        />
        <DetailBlock label="Recipients" value={delivery.recipients.join(", ") || "No recipients"} />
        </dl>
      </div>
    </section>
  );
}

function InfoTile({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border-l-2 border-border px-4 py-2">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function RecipientHint({ count }: { count: number }) {
  return (
    <p className="text-xs text-muted-foreground">
      {count === 0 ? "No valid recipients parsed yet." : `${count} unique recipient${count === 1 ? "" : "s"} ready.`}
    </p>
  );
}

function ScheduleCard({
  schedule,
  saving,
  onToggle,
  onSendNow,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  schedule: ReportScheduleRecord;
  saving: boolean;
  onToggle: () => void;
  onSendNow: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="border-y py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-base font-medium">{schedule.name}</p>
            <StatusBadge schedule={schedule} />
            <span className="text-xs text-muted-foreground">
              {schedule.scope === "company" ? schedule.companyName ?? "Company" : "Global workspace"} / {getCadenceLabel(schedule.cadence)} / {schedule.template}
            </span>
          </div>

          <dl className="grid border-y sm:grid-cols-2 xl:grid-cols-6 xl:divide-x">
            <DetailBlock label="Next run" value={new Date(schedule.nextRunAt).toLocaleString()} />
            <DetailBlock label="Last delivery" value={schedule.lastDeliveredAt ? new Date(schedule.lastDeliveredAt).toLocaleString() : "No delivery yet"} />
            <DetailBlock label="Delivery status" value={getScheduleDeliveryStatusLabel(schedule)} />
            <DetailBlock label="Recipients" value={schedule.recipientEmails.join(", ") || "No recipients"} />
            <DetailBlock label="Brand" value={schedule.reportBrandName || "Profile organization"} />
            <DetailBlock label="Package" value={buildSchedulePackageLabel(schedule)} />
          </dl>

          {schedule.lastErrorMessage ? (
            <div className="border-l-2 border-destructive px-4 py-2 text-sm text-destructive">
              {schedule.lastErrorMessage}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 xl:max-w-[320px] xl:justify-end">
          <div className="flex items-center gap-3 px-1 py-1">
            <span className="text-xs text-muted-foreground">Active</span>
            <Switch checked={schedule.isActive} onCheckedChange={onToggle} />
          </div>
          <Button onClick={onSendNow} disabled={saving}>
            Send now
          </Button>
          <Button variant="ghost" onClick={onEdit} disabled={saving}>
            Load into builder
          </Button>
          <Button variant="ghost" onClick={onDuplicate} disabled={saving}>
            Duplicate
          </Button>
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete} disabled={saving}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ schedule }: { schedule: ReportScheduleRecord }) {
  if (!schedule.isActive) {
    return <span className="text-xs font-medium text-slate-500 dark:text-slate-300">Paused</span>;
  }

  if (schedule.lastStatus === "failed") {
    return <span className="text-xs font-medium text-rose-600 dark:text-rose-300">Failed</span>;
  }

  if (schedule.lastStatus === "running") {
    return <span className="text-xs font-medium text-amber-600 dark:text-amber-300">Sending</span>;
  }

  if (schedule.lastStatus === "delivered") {
    return <span className="text-xs font-medium text-emerald-600 dark:text-emerald-300">Delivered</span>;
  }

  return <span className="text-xs font-medium text-sky-600 dark:text-sky-300">Ready</span>;
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b px-3 py-3 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm leading-5 [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function ReportPreviewPanel({
  report,
  onExportHtml,
}: {
  report: GeneratedReport;
  onExportHtml: () => void;
}) {
  const maxFailureCount = Math.max(1, ...report.failingMonitors.map((monitor) => monitor.failures));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>{report.title}</CardTitle>
              <CardDescription>
                {report.periodLabel} / Generated {new Date(report.generatedAt).toLocaleString()}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-muted-foreground">{report.templateLabel} / {report.workspaceName}</span>
              <Button variant="outline" size="sm" onClick={onExportHtml}>
                <Download className="mr-2 h-4 w-4" />
                Download HTML
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <dl className="grid border-y md:grid-cols-2 xl:grid-cols-4 xl:divide-x">
            <PreviewMetric label="Health" value={`${report.summary.healthScore}/100`} detail={report.summary.healthStatus} />
            <PreviewMetric label="Monitors" value={String(report.summary.monitorCount)} />
            <PreviewMetric label="Uptime" value={`${report.summary.uptimePct.toFixed(2)}%`} />
            <PreviewMetric label="P95 latency" value={`${report.summary.p95LatencyMs}ms`} detail={`${report.summary.averageLatencyMs}ms avg`} />
            <PreviewMetric label="Failures" value={String(report.summary.failureEvents)} />
            <PreviewMetric label="Impacted" value={String(report.summary.impactedMonitors)} detail="monitors with failures" />
            <PreviewMetric label="Failure rate" value={`${report.summary.failureRatePct.toFixed(2)}%`} />
          </dl>

          <dl className="grid border-y md:grid-cols-3 md:divide-x">
            <StateChip tone="emerald" label="Up now" value={String(report.summary.currentlyUp)} />
            <StateChip tone="rose" label="Down now" value={String(report.summary.currentlyDown)} />
            <StateChip tone="amber" label="Pending now" value={String(report.summary.currentlyPending)} />
          </dl>

        </CardContent>
      </Card>

      <section className="border-y py-4">
        <div>
          <h3 className="text-base font-medium">Report findings</h3>
          <p className="text-sm text-muted-foreground">Derived from status, failure frequency, and latency.</p>
        </div>
        <div className="divide-y pt-3">
          {report.recommendations.map((item, index) => (
            <div key={`${item}-${index}`} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm leading-6">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="overflow-hidden border-border/70">
          <CardHeader className="border-b bg-muted/10">
            <CardTitle className="text-base">Top failing monitors</CardTitle>
            <CardDescription>Highest failure counts for the selected period.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y pt-4">
            {report.failingMonitors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No failures during the selected period.</p>
            ) : (
              report.failingMonitors.map((monitor) => (
                <div key={monitor.monitorId} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium [overflow-wrap:anywhere]">{monitor.url}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {monitor.lastFailureAt ? `Last failure ${new Date(monitor.lastFailureAt).toLocaleString()}` : "No timestamp recorded"}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">{monitor.failures} failures</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.max(10, (monitor.failures / maxFailureCount) * 100)}%` }} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/70">
          <CardHeader className="border-b bg-muted/10">
            <CardTitle className="text-base">Latency watchlist</CardTitle>
            <CardDescription>Services with the highest average latency in the report window.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y pt-4">
            {report.slowMonitors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No latency samples for this period.</p>
            ) : (
              report.slowMonitors.map((monitor) => (
                <div key={monitor.monitorId} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium [overflow-wrap:anywhere]">{monitor.url}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Average latency in this report window</p>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">{monitor.averageLatencyMs}ms avg</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <section className="border-y py-4">
        <div>
          <h3 className="text-base font-medium">Recent failure events</h3>
          <p className="text-sm text-muted-foreground">Latest failures included in the report.</p>
        </div>
        <div className="divide-y pt-3">
          {report.recentFailures.length === 0 ? (
            <p className="text-sm text-muted-foreground">No failure events during the selected period.</p>
          ) : (
            report.recentFailures.map((event) => (
              <div key={`${event.monitorId}-${event.createdAt}`} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-medium [overflow-wrap:anywhere]">{event.url}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString()} / HTTP {event.statusCode ?? "N/A"}
                    </p>
                  </div>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    {event.detail}
                  </p>
                </div>
              </div>

            ))
          )}
        </div>
      </section>

      <section className="border-y py-4">
        <div>
          <h3 className="text-base font-medium">Monitor breakdown</h3>
          <p className="text-sm text-muted-foreground">Ranked by failures, then average latency.</p>
        </div>
        <div className="divide-y pt-3">
          {report.monitorBreakdown.map((monitor) => (
            <div key={monitor.monitorId} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-medium [overflow-wrap:anywhere]">{monitor.url}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {monitor.companyName ?? "No company"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Status {monitor.status} / HTTP {monitor.currentStatusCode ?? "N/A"} / {monitor.failures} failures
                  </p>
                  {monitor.lastErrorMessage ? (
                    <p className="mt-2 text-xs leading-5 text-destructive">{monitor.lastErrorMessage}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Uptime {monitor.uptimePct.toFixed(2)}%</span>
                  <span>Avg latency {monitor.averageLatencyMs}ms</span>
                  <span>P95 {monitor.p95LatencyMs}ms</span>
                  <span>Last checked {monitor.lastCheckedAt ? new Date(monitor.lastCheckedAt).toLocaleString() : "N/A"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PreviewMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="border-b px-4 py-3 last:border-b-0 md:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-xl font-semibold tracking-tight">{value}</dd>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function StateChip({
  tone,
  label,
  value,
}: {
  tone: "emerald" | "rose" | "amber";
  label: string;
  value: string;
}) {
  return (
    <div className="border-b px-4 py-3 last:border-b-0 md:border-b-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("mt-2 text-lg font-semibold", tone === "emerald" && "text-emerald-500", tone === "rose" && "text-rose-500", tone === "amber" && "text-amber-500")}>{value}</dd>
    </div>
  );
}

function filterSchedules(schedules: ReportScheduleRecord[], query: string, filter: ScheduleFilter) {
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

function buildScheduleName(scope: ReportScope, cadence: ReportCadence, companyId: string, companies: CompanyRecord[]) {
  const cadenceLabel = getCadenceLabel(cadence);

  if (scope !== "company") {
    return `${cadenceLabel} Workspace Report`;
  }

  const company = companies.find((item) => item.id === companyId);
  return company ? `${cadenceLabel} ${company.name} Report` : `${cadenceLabel} Company Report`;
}

function resolveDraftScopeLabel(
  draft: Pick<DraftReport, "scope" | "companyId">,
  companies: CompanyRecord[]
) {
  if (draft.scope !== "company") {
    return "Workspace";
  }

  return companies.find((company) => company.id === draft.companyId)?.name ?? "Company";
}

function resolveDraftPeriodLabel(cadence: ReportCadence) {
  if (cadence === "weekly") {
    return "Last 7 days";
  }

  return cadence === "monthly" ? "Last 30 days" : "All time";
}

function getCadenceLabel(cadence: ReportCadence) {
  return CADENCE_OPTIONS.find((option) => option.value === cadence)?.label ?? "Weekly";
}

function buildReportDeliveryPayload(draft: ReportDeliveryDraft) {
  return {
    deliveryDetailLevel: draft.deliveryDetailLevel,
    includeOutageSummary: draft.includeOutageSummary,
    includeMonitorBreakdown: draft.includeMonitorBreakdown,
    emailSubjectTemplate: draft.emailSubjectTemplate.trim() || null,
    emailIntroTemplate: draft.emailIntroTemplate.trim() || null,
    reportBrandName: draft.reportBrandName.trim() || null,
  };
}

function buildSchedulePackageLabel(schedule: ReportScheduleRecord) {
  return `${schedule.deliveryDetailLevel} / HTML`;
}

function getScheduleDeliveryStatusLabel(schedule: ReportScheduleRecord) {
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

function parseRecipients(value: string) {
  return Array.from(new Set(value.split(/[\n,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
