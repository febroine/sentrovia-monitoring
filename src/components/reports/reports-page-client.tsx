"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  Copy,
  Download,
  PlayCircle,
  Search,
  Send,
  Sparkles,
  Trash2,
  UsersRound,
  WandSparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  icon: typeof Sparkles;
}> = [
  {
    value: "operations",
    label: "Operations",
    detail: "Detailed runtime language for operators and support teams.",
    icon: BarChart3,
  },
  {
    value: "executive",
    label: "Executive",
    detail: "Condensed summary focused on uptime, risk, and leadership visibility.",
    icon: Sparkles,
  },
  {
    value: "client",
    label: "Client",
    detail: "Customer-friendly wording that keeps technical noise low.",
    icon: UsersRound,
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
    <div className="space-y-6 animate-in fade-in duration-200">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Preview HTML reports, schedule recurring delivery, and review existing report plans.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Badge variant="outline" className="border-emerald-500/25 text-emerald-600 dark:text-emerald-300">
            HTML only
          </Badge>
          <Badge variant="outline" className="border-border/70 text-muted-foreground">
            Next: {activeSchedules[0] ? new Date(activeSchedules[0].nextRunAt).toLocaleString() : "No active schedule"}
          </Badge>
        </div>
      </header>

      {message ? (
        <div
          role={message.tone === "error" ? "alert" : "status"}
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            message.tone === "error" && "border-destructive/30 bg-destructive/5 text-destructive",
            message.tone === "success" && "border-emerald-500/25 bg-emerald-500/5",
            message.tone === "info" && "border-border/70 bg-muted/20"
          )}
        >
          {message.text}
        </div>
      ) : null}

      <div className="inline-flex w-full rounded-lg border bg-muted/30 p-1 sm:w-auto">
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
              title="Preview studio is ready"
              description="Pick a scope, cadence, and template, then generate a preview to inspect the final report before it goes out."
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

                <div className="rounded-lg border bg-muted/15 p-4">
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

          <Card className="overflow-hidden border-emerald-500/15">
            <CardHeader className="border-b bg-emerald-500/5 pb-4">
              <CardTitle className="text-base">Active schedules</CardTitle>
              <CardDescription>Enabled reports that the worker will pick up automatically.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {activeSchedules.length === 0 ? (
                <BuilderEmptyState
                  title="No active report schedule"
                  description="Enable a schedule below or create one from the report builder."
                />
              ) : (
                activeSchedules.slice(0, 6).map((schedule) => (
                  <div key={schedule.id} className="rounded-lg border border-border/70 bg-background/80 px-4 py-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{schedule.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                          {getCadenceLabel(schedule.cadence)} / {schedule.reportBrandName || "Profile organization"} / {schedule.recipientEmails.join(", ")}
                        </p>
                      </div>
                      <Badge variant="outline" className="border-emerald-500/25 text-emerald-600 dark:text-emerald-300">
                        Next {new Date(schedule.nextRunAt).toLocaleString()}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
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
          ? "bg-background text-foreground shadow-sm"
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
  onTemplateChange,
  onChange,
}: {
  template: ReportTemplateVariant;
  draft: ReportDeliveryDraft;
  onTemplateChange: (template: ReportTemplateVariant) => void;
  onChange: (patch: Partial<ReportDeliveryDraft>) => void;
}) {
  return (
    <details className="group rounded-lg border border-border/70 bg-muted/10">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-sm font-medium">Report options</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Template, detail level, included sections, and email copy
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t border-border/70 px-4 py-4">
        <TemplateStrip value={template} onChange={onTemplateChange} />
        <ReportDeliveryComposer draft={draft} onChange={onChange} />
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
    <div className="grid gap-3 lg:grid-cols-3">
      {TEMPLATE_OPTIONS.map((template) => {
        const Icon = template.icon;
        const active = template.value === value;

        return (
          <button
            key={template.value}
            type="button"
            onClick={() => onChange(template.value)}
            className={cn(
              "rounded-lg border px-4 py-4 text-left transition-colors",
              active
                ? "border-primary/30 bg-primary/5"
                : "border-border/70 bg-background hover:border-border hover:bg-muted/10"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold">{template.label}</p>
                <p className="text-xs leading-5 text-muted-foreground">{template.detail}</p>
              </div>
              <div className="rounded-md border border-border/70 bg-background/80 p-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
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
  draft,
  onChange,
}: {
  draft: ReportDeliveryDraft;
  onChange: (patch: Partial<ReportDeliveryDraft>) => void;
}) {
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
          <div className="grid gap-2">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-3">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">HTML only</p>
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
          <Field label="Report brand">
            <Input
              value={draft.reportBrandName}
              onChange={(event) => onChange({ reportBrandName: event.target.value })}
              placeholder="Sentrovia"
            />
          </Field>
          <Field label="Email subject template">
            <Input
              value={draft.emailSubjectTemplate}
              onChange={(event) => onChange({ emailSubjectTemplate: event.target.value })}
              placeholder="[{brand} Report] {title} - {health_status}"
            />
          </Field>
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
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/80 px-3 py-2">
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
    <Card className="overflow-hidden border-dashed border-border/70 bg-muted/10">
      <CardContent className="flex flex-col items-start gap-4 px-5 py-6">
        <div className="rounded-md border border-border/70 bg-background/80 p-3">
          <WandSparkles className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold">{title}</p>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {actionLabel && onAction ? (
          <Button variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DeliveryResultCard({ delivery }: { delivery: DeliveryResult }) {
  return (
    <Card className="overflow-hidden border-border/70 bg-background/60">
      <CardHeader className="border-b border-border/60 pb-3">
        <CardTitle className="text-base">Latest delivery result</CardTitle>
        <CardDescription>
          Manual send feedback for the last report dispatch from this page.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 pt-4 md:grid-cols-4">
        <DetailBlock label="Status" value={delivery.status} />
        <DetailBlock label="Report" value={delivery.reportTitle} />
        <DetailBlock
          label="Delivered"
          value={delivery.deliveredAt ? new Date(delivery.deliveredAt).toLocaleString() : "Waiting for timestamp"}
        />
        <DetailBlock label="Recipients" value={delivery.recipients.join(", ") || "No recipients"} />
      </CardContent>
    </Card>
  );
}

function InfoTile({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-3">
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
    <div className="rounded-lg border border-border/70 bg-muted/5 p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-medium">{schedule.name}</p>
            <StatusBadge schedule={schedule} />
            <Badge variant="outline" className="border-border/70 text-muted-foreground">
              {schedule.scope === "company" ? schedule.companyName ?? "Company" : "Global workspace"}
            </Badge>
            <Badge variant="outline" className="border-border/70 text-muted-foreground">
              {getCadenceLabel(schedule.cadence)}
            </Badge>
            <Badge variant="outline" className="border-border/70 text-muted-foreground">
              {schedule.template}
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <DetailBlock label="Next run" value={new Date(schedule.nextRunAt).toLocaleString()} />
            <DetailBlock label="Last delivery" value={schedule.lastDeliveredAt ? new Date(schedule.lastDeliveredAt).toLocaleString() : "No delivery yet"} />
            <DetailBlock label="Delivery status" value={getScheduleDeliveryStatusLabel(schedule)} />
            <DetailBlock label="Recipients" value={schedule.recipientEmails.join(", ") || "No recipients"} />
            <DetailBlock label="Brand" value={schedule.reportBrandName || "Profile organization"} />
            <DetailBlock label="Package" value={buildSchedulePackageLabel(schedule)} />
          </div>

          {schedule.lastErrorMessage ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {schedule.lastErrorMessage}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 xl:max-w-[320px] xl:justify-end">
          <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
            <span className="text-xs text-muted-foreground">Active</span>
            <Switch checked={schedule.isActive} onCheckedChange={onToggle} />
          </div>
          <Button variant="outline" onClick={onSendNow} disabled={saving}>
            <PlayCircle className="mr-2 h-4 w-4" />
            Send now
          </Button>
          <Button variant="outline" onClick={onEdit} disabled={saving}>
            Load into builder
          </Button>
          <Button variant="outline" onClick={onDuplicate} disabled={saving}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={saving}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ schedule }: { schedule: ReportScheduleRecord }) {
  if (!schedule.isActive) {
    return <Badge variant="outline" className="border-slate-500/25 text-slate-600 dark:text-slate-300">Paused</Badge>;
  }

  if (schedule.lastStatus === "failed") {
    return <Badge variant="outline" className="border-rose-500/25 text-rose-600 dark:text-rose-300">Failed</Badge>;
  }

  if (schedule.lastStatus === "running") {
    return <Badge variant="outline" className="border-amber-500/25 text-amber-600 dark:text-amber-300">Sending</Badge>;
  }

  if (schedule.lastStatus === "delivered") {
    return <Badge variant="outline" className="border-emerald-500/25 text-emerald-600 dark:text-emerald-300">Delivered</Badge>;
  }

  return <Badge variant="outline" className="border-sky-500/25 text-sky-600 dark:text-sky-300">Ready</Badge>;
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/10 px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm leading-6 [overflow-wrap:anywhere]">{value}</p>
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
      <Card className="overflow-hidden border-violet-500/15">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>{report.title}</CardTitle>
              <CardDescription>
                {report.periodLabel} / Generated {new Date(report.generatedAt).toLocaleString()}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-border/70 bg-background/80">
                {report.templateLabel}
              </Badge>
              <Badge variant="outline" className="border-border/70 bg-background/80">
                {report.workspaceName}
              </Badge>
              <Button variant="outline" size="sm" onClick={onExportHtml}>
                <Download className="mr-2 h-4 w-4" />
                Download HTML
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <PreviewMetric label="Health" value={`${report.summary.healthScore}/100`} detail={report.summary.healthStatus} />
            <PreviewMetric label="Monitors" value={String(report.summary.monitorCount)} />
            <PreviewMetric label="Uptime" value={`${report.summary.uptimePct.toFixed(2)}%`} />
            <PreviewMetric label="P95 latency" value={`${report.summary.p95LatencyMs}ms`} detail={`${report.summary.averageLatencyMs}ms avg`} />
            <PreviewMetric label="Failures" value={String(report.summary.failureEvents)} />
            <PreviewMetric label="Impacted" value={String(report.summary.impactedMonitors)} detail="monitors with failures" />
            <PreviewMetric label="Failure rate" value={`${report.summary.failureRatePct.toFixed(2)}%`} />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <StateChip tone="emerald" label="Up now" value={String(report.summary.currentlyUp)} />
            <StateChip tone="rose" label="Down now" value={String(report.summary.currentlyDown)} />
            <StateChip tone="amber" label="Pending now" value={String(report.summary.currentlyPending)} />
          </div>

        </CardContent>
      </Card>

      <Card className="overflow-hidden border-sky-500/15">
        <CardHeader className="border-b bg-sky-500/5">
          <CardTitle className="text-base">Report findings</CardTitle>
          <CardDescription>Items derived from status, failure frequency, and latency in this period.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4 md:grid-cols-2">
          {report.recommendations.map((item, index) => (
            <div key={`${item}-${index}`} className="rounded-lg border border-border/70 bg-background/80 px-4 py-3">
              <p className="text-sm leading-6">{item}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="overflow-hidden border-border/70">
          <CardHeader className="border-b bg-muted/10">
            <CardTitle className="text-base">Top failing monitors</CardTitle>
            <CardDescription>Highest failure counts for the selected period.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {report.failingMonitors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No failures during the selected period.</p>
            ) : (
              report.failingMonitors.map((monitor) => (
                <div key={monitor.monitorId} className="rounded-lg border border-border/70 bg-background/80 p-4">
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
          <CardContent className="space-y-3 pt-4">
            {report.slowMonitors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No latency samples for this period.</p>
            ) : (
              report.slowMonitors.map((monitor) => (
                <div key={monitor.monitorId} className="rounded-lg border border-border/70 bg-background/80 p-4">
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

      <Card className="overflow-hidden border-border/70">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle className="text-base">Recent failure events</CardTitle>
          <CardDescription>Latest failure signals included in the emailed report.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {report.recentFailures.length === 0 ? (
            <p className="text-sm text-muted-foreground">No failure events during the selected period.</p>
          ) : (
            report.recentFailures.map((event) => (
              <div key={`${event.monitorId}-${event.createdAt}`} className="rounded-lg border border-border/70 bg-background/80 p-4">
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
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70">
        <CardHeader className="border-b bg-muted/10">
          <CardTitle>Monitor breakdown</CardTitle>
          <CardDescription>Ranked by failures first, then average latency.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {report.monitorBreakdown.map((monitor) => (
            <div key={monitor.monitorId} className="rounded-lg border border-border/70 bg-background/80 p-4">
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
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="border-border/70">Uptime {monitor.uptimePct.toFixed(2)}%</Badge>
                  <Badge variant="outline" className="border-border/70">Avg latency {monitor.averageLatencyMs}ms</Badge>
                  <Badge variant="outline" className="border-border/70">P95 {monitor.p95LatencyMs}ms</Badge>
                  <Badge variant="outline" className="border-border/70">Last checked {monitor.lastCheckedAt ? new Date(monitor.lastCheckedAt).toLocaleString() : "N/A"}</Badge>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/10 px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
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
    <div
      className={cn(
        "rounded-lg border px-4 py-3",
        tone === "emerald" && "border-emerald-500/25 bg-emerald-500/10",
        tone === "rose" && "border-rose-500/25 bg-rose-500/10",
        tone === "amber" && "border-amber-500/25 bg-amber-500/10"
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
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
