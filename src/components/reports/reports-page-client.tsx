"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  CalendarDays,
  Copy,
  Download,
  FileText,
  Mail,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CompanyRecord } from "@/lib/companies/types";
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
};

const EMPTY_REPORT_DRAFT: DraftReport = {
  scope: "global",
  cadence: "weekly",
  template: "operations",
  companyId: "",
  recipients: "",
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
};

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
  const [message, setMessage] = useState<string | null>(null);
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>("all");

  const summary = useMemo(() => buildSummary(schedules), [schedules]);
  const filteredSchedules = useMemo(
    () => filterSchedules(schedules, scheduleSearch, scheduleFilter),
    [scheduleFilter, scheduleSearch, schedules]
  );

  const refreshPage = useCallback(async () => {
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
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load reports.");
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
        }),
      });
      const data = (await response.json()) as PreviewResponse;

      if (!response.ok || !data.report) {
        throw new Error(data.message ?? "Unable to generate the report preview.");
      }

      setPreview(data.report);
      setMessage("Report preview updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to generate the report preview.");
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
        }),
      });
      const data = (await response.json()) as {
        message?: string;
        report?: GeneratedReport;
        delivery?: { status?: string; deliveredAt?: string | null } | null;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to send the report.");
      }

      if (data.report) {
        setPreview(data.report);
      }

      setLastDeliveryResult({
        status: data.delivery?.status ?? "sent",
        deliveredAt: data.delivery?.deliveredAt ?? null,
        reportTitle: data.report?.title ?? "Manual report",
        recipients: parseRecipients(previewDraft.recipients),
      });
      setMessage("Report sent successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send the report.");
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
        }),
      });
      const data = (await response.json()) as { schedule?: ReportScheduleRecord; message?: string };

      if (!response.ok || !data.schedule) {
        throw new Error(data.message ?? "Unable to create the report schedule.");
      }

      setSchedules((current) => [data.schedule!, ...current]);
      setScheduleDraft(EMPTY_SCHEDULE_DRAFT);
      setMessage("Report schedule created.");
      setActiveTab("schedules");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create the report schedule.");
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
      setMessage("Report schedule updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update the report schedule.");
    } finally {
      setSaving(false);
    }
  }

  async function sendScheduleNow(scheduleId: string) {
    setSaving(true);

    try {
      const response = await fetch(`/api/reports/${scheduleId}/send`, { method: "POST" });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to send the scheduled report.");
      }

      setMessage("Scheduled report sent successfully.");
      await refreshPage();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send the scheduled report.");
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
      setMessage("Report schedule duplicated as a paused copy.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to duplicate the report schedule.");
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
      setMessage("Report schedule deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete the report schedule.");
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
    });
    setActiveTab("schedules");
  }

  function exportPreviewCsv() {
    if (!preview) {
      return;
    }

    const rows = [
      ["Report", preview.title],
      ["Workspace", preview.workspaceName],
      ["Template", preview.templateLabel],
      ["Scope", preview.scope === "company" ? preview.companyName ?? "Company" : "Global workspace"],
      ["Period", preview.periodLabel],
      ["Generated", new Date(preview.generatedAt).toLocaleString()],
      ["Monitors", String(preview.summary.monitorCount)],
      ["Uptime", `${preview.summary.uptimePct.toFixed(2)}%`],
      ["Average latency", `${preview.summary.averageLatencyMs}ms`],
      ["Failures", String(preview.summary.failureEvents)],
      [""],
      ["Monitor", "Status", "Uptime", "Avg latency", "Checks", "Failures"],
      ...preview.monitorBreakdown.map((monitor) => [
        monitor.name,
        monitor.status,
        `${monitor.uptimePct.toFixed(2)}%`,
        `${monitor.averageLatencyMs}ms`,
        String(monitor.totalChecks),
        String(monitor.failures),
      ]),
    ];

    downloadFile(toCsv(rows), `${slugify(preview.title)}.csv`, "text/csv;charset=utf-8");
  }

  function exportPreviewPdf() {
    if (!preview) {
      return;
    }

    const printDocument = buildPrintableReportHtml(preview);
    const printBlob = new Blob([printDocument], { type: "text/html;charset=utf-8" });
    const printUrl = URL.createObjectURL(printBlob);
    const printWindow = window.open(printUrl, "_blank", "width=960,height=720");

    if (!printWindow) {
      URL.revokeObjectURL(printUrl);
      setMessage("Pop-up blocked. Allow pop-ups to export a print-ready PDF view.");
      return;
    }

    printWindow.focus();
    window.setTimeout(() => {
      URL.revokeObjectURL(printUrl);
    }, 60_000);
  }

  const previewRecipients = parseRecipients(previewDraft.recipients);
  const scheduleRecipients = parseRecipients(scheduleDraft.recipients);
  const previewNeedsCompany = previewDraft.scope === "company" && !previewDraft.companyId;
  const scheduleNeedsCompany = scheduleDraft.scope === "company" && !scheduleDraft.companyId;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <header className="overflow-hidden rounded-3xl border border-violet-500/15 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.18),transparent_38%),linear-gradient(180deg,rgba(15,23,42,0.45),rgba(15,23,42,0.08))]">
        <div className="border-l-4 border-l-violet-500 px-5 py-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-violet-500/25 bg-violet-500/10 text-violet-200">
                  Reports
                </Badge>
                <Badge variant="outline" className="border-sky-500/25 bg-sky-500/10 text-sky-200">
                  Weekly / Monthly
                </Badge>
              </div>
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-white">Reporting Center</h1>
                <p className="max-w-3xl text-sm leading-6 text-slate-200/85">
                  Build manual previews, schedule recurring delivery, and keep workspace or company reporting in one polished command deck.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[420px]">
              <HeroStat icon={CalendarDays} label="Next send" value={summary.nextRunLabel} detail="Closest scheduled delivery" />
              <HeroStat icon={Mail} label="Recipients" value={String(summary.recipientCount)} detail="Unique emails across schedules" />
            </div>
          </div>
        </div>
      </header>

      {message ? <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm">{message}</div> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard icon={CalendarDays} label="Active schedules" value={String(summary.activeSchedules)} description="Auto-send schedules currently enabled." tone="violet" />
        <SummaryCard icon={Sparkles} label="Weekly" value={String(summary.weeklySchedules)} description="Weekly report automations." tone="sky" />
        <SummaryCard icon={BarChart3} label="Monthly" value={String(summary.monthlySchedules)} description="Monthly report automations." tone="amber" />
        <SummaryCard icon={Building2} label="Company scoped" value={String(summary.companySchedules)} description="Schedules tied to a single company." tone="emerald" />
        <SummaryCard icon={Mail} label="Paused" value={String(summary.pausedSchedules)} description="Schedules waiting to be re-enabled." tone="slate" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="overflow-hidden border-border/70">
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">Quick launch</CardTitle>
            <CardDescription>
              Use a preset to jump into the report type you create most often.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4 sm:grid-cols-3">
            <PresetButton
              title="Weekly workspace"
              detail="Fast global pulse"
              onClick={() => applyPreviewPreset("global", "weekly", "operations")}
            />
            <PresetButton
              title="Monthly executive"
              detail="Leadership snapshot"
              onClick={() => applyPreviewPreset("global", "monthly", "executive")}
            />
            <PresetButton
              title="Company report"
              detail="Scoped client view"
              onClick={() => applyPreviewPreset("company", "weekly", "client")}
            />
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/70">
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">Schedule pulse</CardTitle>
            <CardDescription>
              Keep an eye on upcoming sends and the latest delivery outcome.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4 sm:grid-cols-3">
            <PulseMetric label="Next run" value={summary.nextRunLabel} />
            <PulseMetric label="Last delivered" value={summary.lastDeliveredLabel} />
            <PulseMetric label="Latest status" value={summary.latestStatusLabel} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
        <Card className="self-start overflow-hidden border-border/70">
          <CardContent className="space-y-3 p-3">
            <ReportModeButton
              active={activeTab === "preview"}
              title="Preview Studio"
              description="Generate a one-off report and review the output before sharing."
              onClick={() => setActiveTab("preview")}
            />
            <ReportModeButton
              active={activeTab === "schedules"}
              title="Schedule Manager"
              description="Create recurring report runs and manage existing delivery plans."
              onClick={() => setActiveTab("schedules")}
            />
          </CardContent>
        </Card>

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
              <TemplateStrip
                value={previewDraft.template}
                onChange={(template) => setPreviewDraft((current) => ({ ...current, template }))}
              />

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
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
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
              onExportCsv={exportPreviewCsv}
              onExportPdf={exportPreviewPdf}
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
              <TemplateStrip
                value={scheduleDraft.template}
                onChange={(template) => setScheduleDraft((current) => ({ ...current, template }))}
              />

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
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
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

                <div className="rounded-2xl border bg-muted/15 p-4">
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
                    onDelete={() => void deleteSchedule(schedule.id)}
                  />
                ))
              )}
            </CardContent>
          </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  description,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  description: string;
  tone: "violet" | "sky" | "amber" | "emerald" | "slate";
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className={cn("border-l-4 px-4 py-4", resolveAccentClass(tone))}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <div className={cn("rounded-2xl border p-2.5", resolveBadgeClass(tone))}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">{label}</p>
          <p className="text-lg font-semibold text-white">{value}</p>
          <p className="text-xs text-slate-300/80">{detail}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-2">
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
    </div>
  );
}

function ReportModeButton({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border px-4 py-4 text-left transition-colors",
        active
          ? "border-primary/30 bg-primary/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          : "border-border/70 bg-background hover:border-border hover:bg-muted/10"
      )}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </button>
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
              "rounded-2xl border px-4 py-4 text-left transition-colors",
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
              <div className="rounded-xl border border-border/70 bg-background/80 p-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </button>
        );
      })}
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
        <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
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
      <CardContent className="grid gap-3 pt-4 md:grid-cols-3">
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

function PresetButton({
  title,
  detail,
  onClick,
}: {
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-border/70 bg-background px-4 py-4 text-left transition hover:border-border hover:bg-muted/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <WandSparkles className="h-4 w-4 text-violet-500" />
      </div>
    </button>
  );
}

function PulseMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  );
}

function InfoTile({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 px-4 py-3">
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
    <div className="rounded-3xl border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_60%)] p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-medium">{schedule.name}</p>
            <StatusBadge schedule={schedule} />
            <Badge variant="outline" className="border-border/70 text-muted-foreground">
              {schedule.scope === "company" ? schedule.companyName ?? "Company" : "Global workspace"}
            </Badge>
            <Badge variant="outline" className="border-border/70 text-muted-foreground">
              {schedule.cadence}
            </Badge>
            <Badge variant="outline" className="border-border/70 text-muted-foreground">
              {schedule.template}
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <DetailBlock label="Next run" value={new Date(schedule.nextRunAt).toLocaleString()} />
            <DetailBlock label="Last delivery" value={schedule.lastDeliveredAt ? new Date(schedule.lastDeliveredAt).toLocaleString() : "No delivery yet"} />
            <DetailBlock label="Recipients" value={schedule.recipientEmails.join(", ") || "No recipients"} />
          </div>

          {schedule.lastErrorMessage ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {schedule.lastErrorMessage}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 xl:max-w-[320px] xl:justify-end">
          <div className="flex items-center gap-3 rounded-2xl border bg-background px-3 py-2">
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

  if (schedule.lastStatus === "delivered") {
    return <Badge variant="outline" className="border-emerald-500/25 text-emerald-600 dark:text-emerald-300">Delivered</Badge>;
  }

  return <Badge variant="outline" className="border-sky-500/25 text-sky-600 dark:text-sky-300">Ready</Badge>;
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm leading-6">{value}</p>
    </div>
  );
}

function ReportPreviewPanel({
  report,
  onExportCsv,
  onExportPdf,
}: {
  report: GeneratedReport;
  onExportCsv: () => void;
  onExportPdf: () => void;
}) {
  const maxFailureCount = Math.max(1, ...report.failingMonitors.map((monitor) => monitor.failures));

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-violet-500/15">
        <CardHeader className="border-b bg-[linear-gradient(135deg,rgba(124,58,237,0.08),transparent_60%)]">
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
              <Button variant="outline" size="sm" onClick={onExportCsv}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={onExportPdf}>
                <FileText className="mr-2 h-4 w-4" />
                Export PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <PreviewMetric label="Monitors" value={String(report.summary.monitorCount)} />
            <PreviewMetric label="Uptime" value={`${report.summary.uptimePct.toFixed(2)}%`} />
            <PreviewMetric label="Avg latency" value={`${report.summary.averageLatencyMs}ms`} />
            <PreviewMetric label="Failures" value={String(report.summary.failureEvents)} />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <StateChip tone="emerald" label="Up now" value={String(report.summary.currentlyUp)} />
            <StateChip tone="rose" label="Down now" value={String(report.summary.currentlyDown)} />
            <StateChip tone="amber" label="Pending now" value={String(report.summary.currentlyPending)} />
          </div>

          <div className="flex flex-wrap gap-2">
            {report.statusCodes.length === 0 ? (
              <Badge variant="outline" className="border-border/70 text-muted-foreground">
                No status code distribution yet
              </Badge>
            ) : (
              report.statusCodes.map((item) => (
                <Badge key={`${item.statusCode}-${item.count}`} variant="outline" className="border-border/70">
                  HTTP {item.statusCode} / {item.count}
                </Badge>
              ))
            )}
          </div>
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
                <div key={monitor.monitorId} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{monitor.name}</p>
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
                <div key={monitor.monitorId} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{monitor.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{monitor.checks} latency samples</p>
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
          <CardTitle>Monitor breakdown</CardTitle>
          <CardDescription>Ranked by failures first, then average latency.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {report.monitorBreakdown.map((monitor) => (
            <div key={monitor.monitorId} className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-medium">{monitor.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Status {monitor.status} / {monitor.totalChecks} checks / {monitor.failures} failures
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="border-border/70">Uptime {monitor.uptimePct.toFixed(2)}%</Badge>
                  <Badge variant="outline" className="border-border/70">Avg latency {monitor.averageLatencyMs}ms</Badge>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
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
        "rounded-2xl border px-4 py-3",
        tone === "emerald" && "border-emerald-500/25 bg-emerald-500/10",
        tone === "rose" && "border-rose-500/25 bg-rose-500/10",
        tone === "amber" && "border-amber-500/25 bg-amber-500/10"
      )}
    >
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function buildSummary(schedules: ReportScheduleRecord[]) {
  const activeSchedules = schedules.filter((schedule) => schedule.isActive).length;
  const pausedSchedules = schedules.length - activeSchedules;
  const weeklySchedules = schedules.filter((schedule) => schedule.cadence === "weekly").length;
  const monthlySchedules = schedules.filter((schedule) => schedule.cadence === "monthly").length;
  const companySchedules = schedules.filter((schedule) => schedule.scope === "company").length;
  const recipientCount = new Set(schedules.flatMap((schedule) => schedule.recipientEmails)).size;
  const nextRun = schedules.filter((schedule) => schedule.isActive).sort((left, right) => new Date(left.nextRunAt).getTime() - new Date(right.nextRunAt).getTime())[0];
  const lastDelivered = schedules
    .filter((schedule) => schedule.lastDeliveredAt)
    .sort((left, right) => {
      const leftTime = left.lastDeliveredAt ? new Date(left.lastDeliveredAt).getTime() : 0;
      const rightTime = right.lastDeliveredAt ? new Date(right.lastDeliveredAt).getTime() : 0;
      return rightTime - leftTime;
    })[0];
  const latestStatus = schedules[0]?.lastStatus ?? "idle";

  return {
    activeSchedules,
    pausedSchedules,
    weeklySchedules,
    monthlySchedules,
    companySchedules,
    recipientCount,
    nextRunLabel: nextRun ? new Date(nextRun.nextRunAt).toLocaleString() : "No active schedule",
    lastDeliveredLabel: lastDelivered?.lastDeliveredAt ? new Date(lastDelivered.lastDeliveredAt).toLocaleString() : "No delivery yet",
    latestStatusLabel: latestStatus,
  };
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
  const cadenceLabel = cadence === "weekly" ? "Weekly" : "Monthly";

  if (scope !== "company") {
    return `${cadenceLabel} Workspace Report`;
  }

  const company = companies.find((item) => item.id === companyId);
  return company ? `${cadenceLabel} ${company.name} Report` : `${cadenceLabel} Company Report`;
}

function resolveAccentClass(tone: "violet" | "sky" | "amber" | "emerald" | "slate") {
  if (tone === "violet") return "border-l-violet-500";
  if (tone === "sky") return "border-l-sky-500";
  if (tone === "amber") return "border-l-amber-500";
  if (tone === "emerald") return "border-l-emerald-500";
  return "border-l-slate-400";
}

function resolveBadgeClass(tone: "violet" | "sky" | "amber" | "emerald" | "slate") {
  if (tone === "violet") return "border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-300";
  if (tone === "sky") return "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-300";
  if (tone === "amber") return "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300";
  if (tone === "emerald") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
  return "border-border/70 bg-muted/25 text-muted-foreground";
}

function parseRecipients(value: string) {
  return Array.from(new Set(value.split(/[\n,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean)));
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function toCsv(rows: Array<Array<string>>) {
  return rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(",")
    )
    .join("\n");
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildPrintableReportHtml(report: GeneratedReport) {
  const breakdownRows = report.monitorBreakdown
    .map(
      (monitor) => `
        <tr>
          <td>${escapeHtml(reportValue(monitor.name))}</td>
          <td>${escapeHtml(reportValue(monitor.status))}</td>
          <td>${escapeHtml(`${monitor.uptimePct.toFixed(2)}%`)}</td>
          <td>${escapeHtml(`${monitor.averageLatencyMs}ms`)}</td>
          <td>${escapeHtml(String(monitor.totalChecks))}</td>
          <td>${escapeHtml(String(monitor.failures))}</td>
        </tr>
      `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(report.title)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #111827; }
          .hero { border: 1px solid #e5e7eb; border-radius: 20px; padding: 24px; margin-bottom: 24px; }
          .eyebrow { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #64748b; margin-bottom: 8px; }
          .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px; }
          .stat { border: 1px solid #e5e7eb; border-radius: 16px; padding: 14px; }
          .stat-label { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #64748b; }
          .stat-value { font-size: 24px; font-weight: 700; margin-top: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 10px 12px; text-align: left; font-size: 13px; }
          th { color: #475569; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; }
          .section-title { font-size: 18px; font-weight: 700; margin: 28px 0 12px; }
          @media print {
            body { margin: 16px; }
          }
        </style>
        <script>
          window.addEventListener("load", () => {
            window.setTimeout(() => window.print(), 150);
          });
        </script>
      </head>
      <body>
        <div class="hero">
          <div class="eyebrow">${escapeHtml(report.templateLabel)}</div>
          <h1>${escapeHtml(report.title)}</h1>
          <p>${escapeHtml(report.workspaceName)} · ${escapeHtml(report.periodLabel)} · ${escapeHtml(
            new Date(report.generatedAt).toLocaleString()
          )}</p>
        </div>

        <div class="stats">
          <div class="stat"><div class="stat-label">Monitors</div><div class="stat-value">${report.summary.monitorCount}</div></div>
          <div class="stat"><div class="stat-label">Uptime</div><div class="stat-value">${report.summary.uptimePct.toFixed(
            2
          )}%</div></div>
          <div class="stat"><div class="stat-label">Avg latency</div><div class="stat-value">${report.summary.averageLatencyMs}ms</div></div>
          <div class="stat"><div class="stat-label">Failures</div><div class="stat-value">${report.summary.failureEvents}</div></div>
        </div>

        <div class="section-title">Monitor breakdown</div>
        <table>
          <thead>
            <tr>
              <th>Monitor</th>
              <th>Status</th>
              <th>Uptime</th>
              <th>Avg latency</th>
              <th>Checks</th>
              <th>Failures</th>
            </tr>
          </thead>
          <tbody>${breakdownRows}</tbody>
        </table>
      </body>
    </html>
  `;
}

function reportValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
