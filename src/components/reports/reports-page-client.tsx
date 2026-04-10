"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Building2, CalendarDays, Mail, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { CompanyRecord } from "@/lib/companies/types";
import type { GeneratedReport, ReportCadence, ReportScheduleRecord, ReportScope } from "@/lib/reports/types";

type ReportsResponse = {
  schedules?: ReportScheduleRecord[];
  message?: string;
};

type PreviewResponse = {
  report?: GeneratedReport;
  message?: string;
};

const EMPTY_PREVIEW_RECIPIENTS = "";

export default function ReportsPageClient() {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [schedules, setSchedules] = useState<ReportScheduleRecord[]>([]);
  const [activeTab, setActiveTab] = useState<"preview" | "schedules">("preview");
  const [scope, setScope] = useState<ReportScope>("global");
  const [cadence, setCadence] = useState<ReportCadence>("weekly");
  const [companyId, setCompanyId] = useState("");
  const [previewRecipients, setPreviewRecipients] = useState(EMPTY_PREVIEW_RECIPIENTS);
  const [preview, setPreview] = useState<GeneratedReport | null>(null);
  const [scheduleName, setScheduleName] = useState("Weekly Workspace Report");
  const [scheduleRecipients, setScheduleRecipients] = useState("");
  const [scheduleNextRunAt, setScheduleNextRunAt] = useState("");
  const [scheduleActive, setScheduleActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const summary = useMemo(() => {
    const activeSchedules = schedules.filter((schedule) => schedule.isActive).length;
    const weeklySchedules = schedules.filter((schedule) => schedule.cadence === "weekly").length;
    const monthlySchedules = schedules.filter((schedule) => schedule.cadence === "monthly").length;
    const recipientCount = new Set(schedules.flatMap((schedule) => schedule.recipientEmails)).size;

    return { activeSchedules, weeklySchedules, monthlySchedules, recipientCount };
  }, [schedules]);

  useEffect(() => {
    const scopeLabel = cadence === "weekly" ? "Weekly" : "Monthly";
    setScheduleName(
      scope === "company" && companyId
        ? `${scopeLabel} Company Report`
        : `${scopeLabel} Workspace Report`
      );
  }, [cadence, companyId, scope]);

  const refreshPage = useCallback(async () => {
    setLoading(true);

    try {
      const [reportsResponse, companiesResponse] = await Promise.all([
        fetch("/api/reports", { cache: "no-store" }),
        fetch("/api/companies", { cache: "no-store" }),
      ]);
      const reportsData = (await reportsResponse.json()) as ReportsResponse;
      const companiesData = (await companiesResponse.json()) as { companies?: CompanyRecord[]; message?: string };

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

  async function generatePreview() {
    setSaving(true);

    try {
      const response = await fetch("/api/reports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          cadence,
          companyId: scope === "company" ? companyId : null,
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
          scope,
          cadence,
          companyId: scope === "company" ? companyId : null,
          recipientEmails: parseRecipients(previewRecipients),
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
          name: scheduleName,
          scope,
          cadence,
          companyId: scope === "company" ? companyId : null,
          recipientEmails: parseRecipients(scheduleRecipients),
          isActive: scheduleActive,
          nextRunAt: scheduleNextRunAt ? new Date(scheduleNextRunAt).toISOString() : null,
        }),
      });
      const data = (await response.json()) as { schedule?: ReportScheduleRecord; message?: string };

      if (!response.ok || !data.schedule) {
        throw new Error(data.message ?? "Unable to create the report schedule.");
      }

      setSchedules((current) => [data.schedule!, ...current]);
      setScheduleRecipients("");
      setScheduleNextRunAt("");
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

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <header className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-l-2 border-l-violet-500 px-5 py-5">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl border bg-background p-3 shadow-sm">
              <BarChart3 className="h-5 w-5 text-violet-700 dark:text-violet-300" />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-700 dark:text-violet-300">
                Reporting
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reports</h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Generate weekly or monthly workspace reports, create company-specific schedules, and auto-send summaries to your recipient lists.
              </p>
            </div>
          </div>
        </div>
      </header>

      {message ? (
        <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-sm">{message}</div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={CalendarDays} label="Active Schedules" value={String(summary.activeSchedules)} description="Reports set to auto-send." />
        <SummaryCard icon={Sparkles} label="Weekly" value={String(summary.weeklySchedules)} description="Weekly report schedules." />
        <SummaryCard icon={BarChart3} label="Monthly" value={String(summary.monthlySchedules)} description="Monthly report schedules." />
        <SummaryCard icon={Mail} label="Recipients" value={String(summary.recipientCount)} description="Unique report recipients across schedules." />
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "preview" | "schedules")} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Generate Manual Report</CardTitle>
              <CardDescription>Preview a report instantly or deliver it to a custom recipient list.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Scope">
                  <Select value={scope} onValueChange={(value) => setScope(value as ReportScope)}>
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
                  <Select value={cadence} onValueChange={(value) => setCadence(value as ReportCadence)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {scope === "company" ? (
                  <Field label="Company">
                    <Select value={companyId} onValueChange={(value) => setCompanyId(String(value))}>
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
                ) : null}
                <Field label="Recipients">
                  <Textarea
                    rows={3}
                    value={previewRecipients}
                    onChange={(event) => setPreviewRecipients(event.target.value)}
                    placeholder="alerts@company.com, ops@company.com"
                  />
                </Field>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void generatePreview()} disabled={saving || (scope === "company" && !companyId)}>
                  {saving ? "Generating..." : "Generate Preview"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void sendPreviewNow()}
                  disabled={saving || parseRecipients(previewRecipients).length === 0 || (scope === "company" && !companyId)}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Send Now
                </Button>
              </div>
            </CardContent>
          </Card>

          {preview ? <ReportPreviewPanel report={preview} /> : null}
        </TabsContent>

        <TabsContent value="schedules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create Scheduled Report</CardTitle>
              <CardDescription>Set up recurring weekly or monthly reports and keep the same recipient list on autopilot.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Schedule name">
                  <Input value={scheduleName} onChange={(event) => setScheduleName(event.target.value)} />
                </Field>
                <Field label="Scope">
                  <Select value={scope} onValueChange={(value) => setScope(value as ReportScope)}>
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
                  <Select value={cadence} onValueChange={(value) => setCadence(value as ReportCadence)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {scope === "company" ? (
                  <Field label="Company">
                    <Select value={companyId} onValueChange={(value) => setCompanyId(String(value))}>
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
                ) : null}
                <Field label="Recipients">
                  <Textarea
                    rows={3}
                    value={scheduleRecipients}
                    onChange={(event) => setScheduleRecipients(event.target.value)}
                    placeholder="alerts@company.com, leadership@company.com"
                  />
                </Field>
                <Field label="First run">
                  <Input
                    type="datetime-local"
                    value={scheduleNextRunAt}
                    onChange={(event) => setScheduleNextRunAt(event.target.value)}
                  />
                </Field>
                <div className="rounded-xl border bg-muted/15 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Auto-send</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Active schedules will be picked up by the worker automatically.
                      </p>
                    </div>
                    <Switch checked={scheduleActive} onCheckedChange={setScheduleActive} />
                  </div>
                </div>
              </div>

              <Button
                onClick={() => void createSchedule()}
                disabled={saving || parseRecipients(scheduleRecipients).length === 0 || (scope === "company" && !companyId)}
              >
                {saving ? "Creating..." : "Create Schedule"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Scheduled Reports</CardTitle>
              <CardDescription>Manage recurring delivery, review next runs, and trigger an on-demand send.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading report schedules...</p>
              ) : schedules.length === 0 ? (
                <p className="text-sm text-muted-foreground">No report schedules created yet.</p>
              ) : (
                schedules.map((schedule) => (
                  <div key={schedule.id} className="rounded-2xl border bg-muted/10 p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{schedule.name}</p>
                          <span className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground">
                            {schedule.scope === "company" ? schedule.companyName ?? "Company" : "Global workspace"}
                          </span>
                          <span className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground">
                            {schedule.cadence}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Next run: {new Date(schedule.nextRunAt).toLocaleString()} · Last status: {schedule.lastStatus}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Recipients: {schedule.recipientEmails.join(", ") || "No recipients"}
                        </p>
                        {schedule.lastErrorMessage ? (
                          <p className="text-xs text-destructive">{schedule.lastErrorMessage}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="rounded-xl border bg-background px-3 py-2">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">Active</span>
                            <Switch checked={schedule.isActive} onCheckedChange={() => void toggleSchedule(schedule)} />
                          </div>
                        </div>
                        <Button variant="outline" onClick={() => void sendScheduleNow(schedule.id)} disabled={saving}>
                          <Send className="mr-2 h-4 w-4" />
                          Send Now
                        </Button>
                      </div>
                    </div>
                  </div>
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
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="border-l-2 border-l-violet-500 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <div className="rounded-xl border bg-muted/25 p-2">
            <Icon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
        </div>
      </CardContent>
    </Card>
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

function ReportPreviewPanel({ report }: { report: GeneratedReport }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{report.title}</CardTitle>
          <CardDescription>
            {report.periodLabel} · Generated {new Date(report.generatedAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PreviewMetric label="Monitors" value={String(report.summary.monitorCount)} />
          <PreviewMetric label="Uptime" value={`${report.summary.uptimePct.toFixed(2)}%`} />
          <PreviewMetric label="Avg latency" value={`${report.summary.averageLatencyMs}ms`} />
          <PreviewMetric label="Failures" value={String(report.summary.failureEvents)} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <ListCard
          title="Top Slow Monitors"
          icon={Sparkles}
          items={report.slowMonitors.map((monitor) => `${monitor.name} · ${monitor.averageLatencyMs}ms avg · ${monitor.checks} checks`)}
        />
        <ListCard
          title="Top Failing Monitors"
          icon={Building2}
          items={report.failingMonitors.map((monitor) => `${monitor.name} · ${monitor.failures} failures`)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monitor Breakdown</CardTitle>
          <CardDescription>Top monitored services ranked by failures and latency during the selected period.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.monitorBreakdown.map((monitor) => (
            <div key={monitor.monitorId} className="rounded-xl border bg-muted/10 px-4 py-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium">{monitor.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Status: {monitor.status} · {monitor.totalChecks} checks · {monitor.failures} failures
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  Uptime {monitor.uptimePct.toFixed(2)}% · Avg latency {monitor.averageLatencyMs}ms
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
    <div className="rounded-xl border bg-muted/10 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function ListCard({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: React.ElementType;
  items: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data for this period.</p>
        ) : (
          items.map((item) => (
            <div key={item} className="rounded-xl border bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
              {item}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function parseRecipients(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}
