"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  CalendarDays,
  Mail,
  PlayCircle,
  Search,
  Send,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CompanyRecord } from "@/lib/companies/types";
import type { GeneratedReport, ReportCadence, ReportScheduleRecord, ReportScope } from "@/lib/reports/types";

type ReportsResponse = { schedules?: ReportScheduleRecord[]; message?: string };
type PreviewResponse = { report?: GeneratedReport; message?: string };
type ScheduleFilter = "all" | "active" | "paused" | "failed";

type DraftReport = {
  scope: ReportScope;
  cadence: ReportCadence;
  companyId: string;
  recipients: string;
};

type DraftSchedule = {
  name: string;
  scope: ReportScope;
  cadence: ReportCadence;
  companyId: string;
  recipients: string;
  nextRunAt: string;
  isActive: boolean;
};

const EMPTY_REPORT_DRAFT: DraftReport = {
  scope: "global",
  cadence: "weekly",
  companyId: "",
  recipients: "",
};

const EMPTY_SCHEDULE_DRAFT: DraftSchedule = {
  name: "Weekly Workspace Report",
  scope: "global",
  cadence: "weekly",
  companyId: "",
  recipients: "",
  nextRunAt: "",
  isActive: true,
};

export default function ReportsPageClient() {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [schedules, setSchedules] = useState<ReportScheduleRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"preview" | "schedules">("preview");
  const [previewDraft, setPreviewDraft] = useState<DraftReport>(EMPTY_REPORT_DRAFT);
  const [scheduleDraft, setScheduleDraft] = useState<DraftSchedule>(EMPTY_SCHEDULE_DRAFT);
  const [preview, setPreview] = useState<GeneratedReport | null>(null);
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
    setScheduleDraft((current) => ({
      ...current,
      name: buildScheduleName(current.scope, current.cadence, current.companyId, companies),
    }));
  }, [companies, scheduleDraft.cadence, scheduleDraft.companyId, scheduleDraft.scope]);

  async function generatePreview() {
    setSaving(true);

    try {
      const response = await fetch("/api/reports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: previewDraft.scope,
          cadence: previewDraft.cadence,
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
          companyId: previewDraft.scope === "company" ? previewDraft.companyId : null,
          recipientEmails: parseRecipients(previewDraft.recipients),
        }),
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to send the report.");
      }

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

  function applyPreviewPreset(scope: ReportScope, cadence: ReportCadence) {
    setPreviewDraft((current) => ({
      ...current,
      scope,
      cadence,
      companyId: scope === "global" ? "" : current.companyId,
    }));
    setActiveTab("preview");
  }

  function loadScheduleIntoBuilder(schedule: ReportScheduleRecord) {
    setScheduleDraft({
      name: schedule.name,
      scope: schedule.scope,
      cadence: schedule.cadence,
      companyId: schedule.companyId ?? "",
      recipients: schedule.recipientEmails.join(", "),
      nextRunAt: toLocalDateTime(schedule.nextRunAt),
      isActive: schedule.isActive,
    });
    setActiveTab("schedules");
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
        <Card className="overflow-hidden border-violet-500/15">
          <CardHeader className="border-b bg-[linear-gradient(135deg,rgba(124,58,237,0.08),transparent_55%)] pb-4">
            <CardTitle className="text-base">Quick launch</CardTitle>
            <CardDescription>
              Use a preset to jump into the report type you create most often.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4 sm:grid-cols-3">
            <PresetButton title="Weekly workspace" detail="Fast global pulse" onClick={() => applyPreviewPreset("global", "weekly")} />
            <PresetButton title="Monthly workspace" detail="Longer trend review" onClick={() => applyPreviewPreset("global", "monthly")} />
            <PresetButton title="Company report" detail="Scoped customer view" onClick={() => applyPreviewPreset("company", "weekly")} />
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-sky-500/15">
          <CardHeader className="border-b bg-[linear-gradient(135deg,rgba(14,165,233,0.08),transparent_55%)] pb-4">
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

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "preview" | "schedules")} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="preview">Preview Studio</TabsTrigger>
          <TabsTrigger value="schedules">Schedule Manager</TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="space-y-4">
          <Card className="overflow-hidden border-border/70">
            <CardHeader className="border-b bg-muted/10 pb-4">
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
                <Button variant="ghost" onClick={() => setPreviewDraft(EMPTY_REPORT_DRAFT)} disabled={saving}>
                  Reset
                </Button>
              </div>

              <RecipientHint count={previewRecipients.length} />
            </CardContent>
          </Card>

          {preview ? <ReportPreviewPanel report={preview} /> : null}
        </TabsContent>

        <TabsContent value="schedules" className="space-y-4">
          <Card className="overflow-hidden border-border/70">
            <CardHeader className="border-b bg-muted/10 pb-4">
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
            <CardHeader className="border-b bg-muted/10 pb-4">
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
                <p className="text-sm text-muted-foreground">No report schedules match the current filters.</p>
              ) : (
                filteredSchedules.map((schedule) => (
                  <ScheduleCard
                    key={schedule.id}
                    schedule={schedule}
                    saving={saving}
                    onToggle={() => void toggleSchedule(schedule)}
                    onSendNow={() => void sendScheduleNow(schedule.id)}
                    onEdit={() => loadScheduleIntoBuilder(schedule)}
                    onDelete={() => void deleteSchedule(schedule.id)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
      className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-4 text-left transition hover:border-violet-500/30 hover:bg-violet-500/5"
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
  onDelete,
}: {
  schedule: ReportScheduleRecord;
  saving: boolean;
  onToggle: () => void;
  onSendNow: () => void;
  onEdit: () => void;
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

function ReportPreviewPanel({ report }: { report: GeneratedReport }) {
  const maxFailureCount = Math.max(1, ...report.failingMonitors.map((monitor) => monitor.failures));

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-violet-500/15">
        <CardHeader className="border-b bg-[linear-gradient(135deg,rgba(124,58,237,0.08),transparent_60%)]">
          <CardTitle>{report.title}</CardTitle>
          <CardDescription>
            {report.periodLabel} / Generated {new Date(report.generatedAt).toLocaleString()}
          </CardDescription>
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
