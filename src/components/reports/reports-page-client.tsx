"use client";

import type { ElementType } from "react";
import {
  CalendarClock,
  ChevronDown,
  CircleCheckBig,
  FileChartColumn,
  Search,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TemplateEditor } from "@/components/settings/template-editor";
import { ReportPreviewPanel } from "@/components/reports/report-preview-panel";
import { useReportsPageState } from "@/components/reports/use-reports-page-state";
import {
  buildDraftReportTitle,
  buildSchedulePackageLabel,
  EMPTY_REPORT_DRAFT,
  EMPTY_SCHEDULE_DRAFT,
  getCadenceLabel,
  getScheduleDeliveryStatusLabel,
  resolveDraftPeriodLabel,
  resolveDraftScopeLabel,
  type DeliveryResult,
  type ReportDeliveryDraft,
  type ScheduleFilter,
} from "@/components/reports/reports-page-model";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  ReportCadence,
  ReportScheduleRecord,
  ReportScope,
  ReportTemplateVariant,
} from "@/lib/reports/types";

const CADENCE_OPTIONS: Array<{ value: Exclude<ReportCadence, "all_time">; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
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
  const pageState = useReportsPageState();
  const {
    activeSchedules,
    activeTab,
    deleteSchedule,
    message,
    saving,
    scheduleToDelete,
    setActiveTab,
    setScheduleToDelete,
  } = pageState;

  return (
    <div className="space-y-6">
      <ReportsHeader nextRunAt={activeSchedules[0]?.nextRunAt} />

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
        <ReportModeButton
          active={activeTab === "preview"}
          title="Preview"
          icon={FileChartColumn}
          tone="text-sky-600 dark:text-sky-400"
          onClick={() => setActiveTab("preview")}
        />
        <ReportModeButton
          active={activeTab === "schedules"}
          title="Schedules"
          icon={CalendarClock}
          tone="text-violet-600 dark:text-violet-400"
          onClick={() => setActiveTab("schedules")}
        />
      </div>

      <div className="space-y-4">
          {activeTab === "preview" ? (
            <ManualReportWorkspace state={pageState} />
          ) : (
            <ScheduledReportWorkspace state={pageState} />
          )}
        </div>

      <ScheduleDeleteDialog
        schedule={scheduleToDelete}
        saving={saving}
        onClose={() => setScheduleToDelete(null)}
        onDelete={(scheduleId) => void deleteSchedule(scheduleId)}
      />
      </div>
  );
}

function ReportsHeader({ nextRunAt }: { nextRunAt?: string }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Generate and schedule seven-day workspace reports.</p>
      </div>
      <div className="flex items-center gap-2 text-sm md:justify-end">
        <CalendarClock className={cn(
          "size-4",
          nextRunAt ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
        )} />
        <span className="text-muted-foreground">
          Next delivery: {nextRunAt ? new Date(nextRunAt).toLocaleString() : "No active schedule"}
        </span>
      </div>
    </header>
  );
}

function ScheduleDeleteDialog({
  schedule,
  saving,
  onClose,
  onDelete,
}: {
  schedule: ReportScheduleRecord | null;
  saving: boolean;
  onClose: () => void;
  onDelete: (scheduleId: string) => void;
}) {
  return (
    <Dialog open={schedule !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete report schedule?</DialogTitle>
          <DialogDescription>
            &ldquo;{schedule?.name}&rdquo; will stop running and its schedule record will be permanently removed.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={saving || !schedule}
            onClick={() => {
              if (!schedule) return;
              onClose();
              onDelete(schedule.id);
            }}
          >
            Delete schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualReportWorkspace({
  state,
}: {
  state: ReturnType<typeof useReportsPageState>;
}) {
  const {
    companies,
    exportPreviewHtml,
    generatePreview,
    lastDeliveryResult,
    preview,
    previewDraft,
    previewNeedsCompany,
    previewNeedsPeriod,
    previewRecipients,
    saving,
    sendPreviewNow,
    setLastDeliveryResult,
    setPreview,
    setPreviewDraft,
  } = state;

  return (
    <>
          <Card className="overflow-hidden border-border/70">
            <CardHeader className="border-b pb-4">
              <CardTitle>Manual report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              <ManualReportFields
                companies={companies}
                draft={previewDraft}
                setDraft={setPreviewDraft}
              />

              <ReportOptionsPanel
                template={previewDraft.template}
                draft={previewDraft}
                subjectTitle={buildDraftReportTitle(previewDraft.scope, previewDraft.cadence, previewDraft.companyId, companies, previewDraft.periodRange)}
                subjectScope={resolveDraftScopeLabel(previewDraft, companies)}
                subjectPeriod={resolveDraftPeriodLabel(previewDraft)}
                onTemplateChange={(template) => setPreviewDraft((current) => ({ ...current, template }))}
                onChange={(patch) => setPreviewDraft((current) => ({ ...current, ...patch }))}
              />

              <ManualReportActions
                disabled={previewNeedsCompany || previewNeedsPeriod}
                hasRecipients={previewRecipients.length > 0}
                saving={saving}
                onGenerate={() => void generatePreview()}
                onSend={() => void sendPreviewNow()}
                onReset={() => {
                  setPreviewDraft(EMPTY_REPORT_DRAFT);
                  setPreview(null);
                  setLastDeliveryResult(null);
                }}
              />

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
              title="Preview not generated"
              description="Generate a preview to review the report before sending."
            />
          )}
    </>
  );
}

function ManualReportFields({
  companies,
  draft,
  setDraft,
}: {
  companies: ReturnType<typeof useReportsPageState>["companies"];
  draft: ReturnType<typeof useReportsPageState>["previewDraft"];
  setDraft: ReturnType<typeof useReportsPageState>["setPreviewDraft"];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Field label="Scope">
        <Select value={draft.scope} onValueChange={(value) => setDraft((current) => ({
          ...current,
          scope: value as ReportScope,
          companyId: value === "global" ? "" : current.companyId,
        }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="global">Global workspace</SelectItem>
            <SelectItem value="company">Company</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Period">
        <Select value={draft.periodRange} onValueChange={(value) => setDraft((current) => ({
          ...current,
          periodRange: value as typeof current.periodRange,
          cadence: value === "30d" ? "monthly" : "weekly",
        }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="custom">Custom dates</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {draft.periodRange === "custom" ? (
        <>
          <Field label="From">
            <Input type="date" value={draft.periodStartedAt} onChange={(event) => setDraft((current) => ({ ...current, periodStartedAt: event.target.value }))} />
          </Field>
          <Field label="Through">
            <Input type="date" min={draft.periodStartedAt || undefined} value={draft.periodEndedAt} onChange={(event) => setDraft((current) => ({ ...current, periodEndedAt: event.target.value }))} />
          </Field>
        </>
      ) : null}
      {draft.scope === "company" ? (
        <Field label="Company">
          <Select value={draft.companyId} onValueChange={(value) => setDraft((current) => ({ ...current, companyId: String(value) }))}>
            <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
            <SelectContent>
              {companies.map((company) => <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      ) : <ReadOnlyField label="Company" value="All companies" />}
      <Field label="Recipients">
        <Textarea
          rows={3}
          value={draft.recipients}
          onChange={(event) => setDraft((current) => ({ ...current, recipients: event.target.value }))}
          placeholder="alerts@company.com, ops@company.com"
        />
      </Field>
    </div>
  );
}

function ManualReportActions({
  disabled,
  hasRecipients,
  saving,
  onGenerate,
  onSend,
  onReset,
}: {
  disabled: boolean;
  hasRecipients: boolean;
  saving: boolean;
  onGenerate: () => void;
  onSend: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={onGenerate} disabled={saving || disabled}>
        {saving ? "Generating..." : "Generate preview"}
      </Button>
      <Button variant="outline" onClick={onSend} disabled={saving || disabled || !hasRecipients}>
        <Send className="mr-2 h-4 w-4" /> Send now
      </Button>
      <Button variant="ghost" onClick={onReset} disabled={saving}>Reset</Button>
    </div>
  );
}

function ScheduledReportWorkspace({ state }: { state: ReturnType<typeof useReportsPageState> }) {
  return (
    <>
      <ScheduleBuilder state={state} />
      <ScheduledReportsList state={state} />
    </>
  );
}

function ScheduleBuilder({ state }: { state: ReturnType<typeof useReportsPageState> }) {
  const { companies, createSchedule, saving, scheduleDraft, scheduleNeedsCompany, scheduleRecipients, setScheduleDraft } = state;
  return (
    <Card className="overflow-hidden border-border/70">
      <CardHeader className="border-b pb-4"><CardTitle>Scheduled report</CardTitle></CardHeader>
      <CardContent className="space-y-5 pt-5">
        <ScheduleFields state={state} />
        <ReportOptionsPanel
          template={scheduleDraft.template}
          draft={scheduleDraft}
          subjectTitle={buildDraftReportTitle(scheduleDraft.scope, scheduleDraft.cadence, scheduleDraft.companyId, companies)}
          subjectScope={resolveDraftScopeLabel(scheduleDraft, companies)}
          subjectPeriod={scheduleDraft.cadence === "weekly" ? "Last 7 days" : "Last 30 days"}
          onTemplateChange={(template) => setScheduleDraft((current) => ({ ...current, template }))}
          onChange={(patch) => setScheduleDraft((current) => ({ ...current, ...patch }))}
        />
        <ScheduleBuilderActions
          disabled={scheduleNeedsCompany || scheduleRecipients.length === 0}
          saving={saving}
          onCreate={() => void createSchedule()}
          onReset={() => setScheduleDraft(EMPTY_SCHEDULE_DRAFT)}
        />
        <RecipientHint count={scheduleRecipients.length} />
      </CardContent>
    </Card>
  );
}

function ScheduleFields({ state }: { state: ReturnType<typeof useReportsPageState> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <ScheduleIdentityFields state={state} />
      <ScheduleDeliveryFields state={state} />
    </div>
  );
}

function ScheduleIdentityFields({ state }: { state: ReturnType<typeof useReportsPageState> }) {
  const { companies, scheduleDraft, setScheduleDraft } = state;
  return (
    <>
      <Field label="Schedule name">
        <Input value={scheduleDraft.name} onChange={(event) => setScheduleDraft((current) => ({ ...current, name: event.target.value }))} />
      </Field>
      <Field label="Scope">
        <Select value={scheduleDraft.scope} onValueChange={(value) => setScheduleDraft((current) => ({
          ...current,
          scope: value as ReportScope,
          companyId: value === "global" ? "" : current.companyId,
        }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="global">Global workspace</SelectItem>
            <SelectItem value="company">Company</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Cadence">
        <Select value={scheduleDraft.cadence} onValueChange={(value) => setScheduleDraft((current) => ({
          ...current,
          cadence: value as ReportCadence,
        }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CADENCE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {scheduleDraft.scope === "company" ? (
        <Field label="Company">
          <Select
            value={scheduleDraft.companyId}
            onValueChange={(value) => setScheduleDraft((current) => ({ ...current, companyId: String(value) }))}
          >
            <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : <ReadOnlyField label="Company" value="All companies" />}
    </>
  );
}

function ScheduleDeliveryFields({ state }: { state: ReturnType<typeof useReportsPageState> }) {
  const { scheduleDraft, setScheduleDraft } = state;
  return (
    <>
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
            <p className="mt-1 text-xs text-muted-foreground">Send reports when this schedule is due.</p>
          </div>
          <Switch
            aria-label="Auto-send report"
            checked={scheduleDraft.isActive}
            onCheckedChange={(value) => setScheduleDraft((current) => ({ ...current, isActive: value }))}
          />
        </div>
      </div>
    </>
  );
}

function ScheduleBuilderActions({
  disabled,
  saving,
  onCreate,
  onReset,
}: {
  disabled: boolean;
  saving: boolean;
  onCreate: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={onCreate} disabled={saving || disabled}>
        {saving ? "Creating..." : "Create schedule"}
      </Button>
      <Button variant="ghost" onClick={onReset} disabled={saving}>Reset</Button>
    </div>
  );
}

function ScheduledReportsList({ state }: { state: ReturnType<typeof useReportsPageState> }) {
  const {
    duplicateSchedule, filteredSchedules, loadScheduleIntoBuilder, loading, saving, scheduleFilter,
    scheduleSearch, sendScheduleNow, setScheduleFilter, setScheduleSearch, setScheduleToDelete, toggleSchedule,
  } = state;
  const hasFilters = Boolean(scheduleSearch.trim()) || scheduleFilter !== "all";
  return (
    <Card className="overflow-hidden border-border/70">
      <CardHeader className="border-b pb-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <CardTitle>Scheduled reports</CardTitle>
          <ScheduleFilters filter={scheduleFilter} search={scheduleSearch} setFilter={setScheduleFilter} setSearch={setScheduleSearch} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading report schedules...</p>
        ) : filteredSchedules.length === 0 ? (
          <BuilderEmptyState
            title={hasFilters ? "No schedules match these filters" : "No report schedules yet"}
            description={hasFilters ? "Change the search or status filter." : "Create a schedule to send reports automatically."}
          />
        ) : filteredSchedules.map((schedule) => (
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
        ))}
      </CardContent>
    </Card>
  );
}

function ScheduleFilters({
  filter,
  search,
  setFilter,
  setSearch,
}: {
  filter: ScheduleFilter;
  search: string;
  setFilter: (filter: ScheduleFilter) => void;
  setSearch: (search: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative min-w-64">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search schedule or recipient" className="pl-9" />
      </div>
      <Select value={filter} onValueChange={(value) => setFilter(value as ScheduleFilter)}>
        <SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All schedules</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="paused">Paused</SelectItem>
          <SelectItem value="failed">Failed</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function ReportModeButton({
  active,
  icon: Icon,
  tone,
  title,
  onClick,
}: {
  active: boolean;
  icon: ElementType;
  tone: string;
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
      <Icon className={cn("mr-2 inline size-4", tone)} />
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
    <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
      <ReportPackageOptions draft={draft} onChange={onChange} />
      <ReportEmailOptions draft={draft} subjectPreview={subjectPreview} onChange={onChange} />
    </div>
  );
}

function ReportPackageOptions({
  draft,
  onChange,
}: {
  draft: ReportDeliveryDraft;
  onChange: (patch: Partial<ReportDeliveryDraft>) => void;
}) {
  return (
    <div className="space-y-4">
      <Field label="Detail level">
        <Select
          value={draft.deliveryDetailLevel}
          onValueChange={(value) => onChange({
            deliveryDetailLevel: value as ReportDeliveryDraft["deliveryDetailLevel"],
          })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
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
  );
}

function ReportEmailOptions({
  draft,
  subjectPreview,
  onChange,
}: {
  draft: ReportDeliveryDraft;
  subjectPreview: string;
  onChange: (patch: Partial<ReportDeliveryDraft>) => void;
}) {
  return (
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
        <p className="text-xs font-medium text-sky-700 dark:text-sky-300">Email subject preview</p>
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
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function BuilderEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border-y px-1 py-5">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function DeliveryResultCard({ delivery }: { delivery: DeliveryResult }) {
  return (
    <section className="border-y border-emerald-500/30 py-4">
      <div className="flex items-start gap-3 pb-3">
        <CircleCheckBig className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div>
          <h2 className="text-base font-medium text-emerald-700 dark:text-emerald-300">Latest delivery result</h2>
        </div>
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

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <p className="min-h-9 py-2 text-sm text-muted-foreground">{value}</p>
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
  if (count === 0) {
    return null;
  }

  return (
    <p className="text-xs text-muted-foreground">
      {count} unique recipient{count === 1 ? "" : "s"}
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
            <Switch aria-label={`${schedule.name} active`} checked={schedule.isActive} onCheckedChange={onToggle} />
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
