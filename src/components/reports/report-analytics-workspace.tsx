"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatPanelDateTime } from "@/lib/time";
import { subscribeToMonitorHistoryReset } from "@/lib/client/monitor-history-events";
import { downloadFile, downloadBlob } from "@/components/reports/reports-page-model";
import { buildPrintableReportHtml, buildReportFileSlug } from "@/lib/reports/export";
import { AVAILABILITY_REFERENCE_PCT, getExecutiveInsights, getMonitorRiskPoints } from "@/lib/reports/analytics-insights";
import {
  formatMonitorAverageLatency,
  formatMonitorP95Latency,
  formatMonitorUptime,
  formatReportFailureRate,
  formatReportP95Latency,
  formatReportUptime,
} from "@/lib/reports/metrics";
import type { GeneratedReport, ReportPeriodRange } from "@/lib/reports/types";
import { ReportComparison } from "@/components/reports/report-comparison";

type MonitorOption = {
  id: string;
  name: string;
  url: string;
  companyId: string | null;
  tags: string[];
  isActive: boolean;
};
type CompanyOption = { id: string; name: string };
type AnalyticsFilters = {
  periodRange: ReportPeriodRange;
  companyId: string;
  monitorIds: string[];
  startedAt: string;
  endedAt: string;
  excludeMonitorIds: string[];
  excludeTags: string[];
  excludeCompanyIds: string[];
};

const INITIAL_FILTERS: AnalyticsFilters = {
  periodRange: "7d",
  companyId: "all",
  monitorIds: [],
  startedAt: "",
  endedAt: "",
  excludeMonitorIds: [],
  excludeTags: [],
  excludeCompanyIds: [],
};
const MAX_EXCLUSIONS_PER_GROUP = 100;
const MAX_VISIBLE_MONITOR_OPTIONS = 200;
const SELECTION_RESET_NOTICE = "One or more selected monitors are no longer in the current analytics scope. Analytics were refreshed with the available selection.";

export function ReportAnalyticsWorkspace() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_FILTERS);
  const [monitors, setMonitors] = useState<MonitorOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const filtersRef = useRef(filters);
  const analyticsRequestRef = useRef(0);
  const hasMonitors = monitors.length > 0;
  const invalidRange = filters.periodRange === "custom"
    && (!filters.startedAt || !filters.endedAt || filters.startedAt > filters.endedAt);

  const loadAnalytics = useCallback(async (nextFilters: AnalyticsFilters) => {
    const requestId = ++analyticsRequestRef.current;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const [monitorsResponse, companiesResponse] = await Promise.all([
        fetch("/api/monitors", { cache: "no-store" }),
        fetch("/api/companies", { cache: "no-store" }),
      ]);
      const monitorsData = (await monitorsResponse.json()) as { monitors?: MonitorOption[]; message?: string };
      const companiesData = (await companiesResponse.json()) as { companies?: CompanyOption[]; message?: string };
      if (!monitorsResponse.ok) throw new Error(monitorsData.message ?? "Unable to load monitors.");
      if (!companiesResponse.ok) throw new Error(companiesData.message ?? "Unable to load companies.");
      if (requestId !== analyticsRequestRef.current) return;

      const activeMonitors = (monitorsData.monitors ?? []).filter((monitor) => monitor.isActive);
      const activeCompanyIds = new Set(activeMonitors.flatMap((monitor) => monitor.companyId ? [monitor.companyId] : []));
      const relevantCompanies = (companiesData.companies ?? []).filter((company) => activeCompanyIds.has(company.id));
      let resolvedFilters = reconcileFiltersWithCatalog(nextFilters, activeMonitors, relevantCompanies);
      let selectionReset = nextFilters.monitorIds.length !== resolvedFilters.monitorIds.length;
      setFilters((currentFilters) => reconcileFiltersWithCatalog(
        currentFilters,
        activeMonitors,
        relevantCompanies
      ));
      setMonitors(activeMonitors);
      setCompanies(relevantCompanies);

      let { response: reportResponse, data: reportData } = await requestAnalyticsReport(resolvedFilters);
      if (shouldRetryAnalyticsWithoutMonitor(reportResponse.status, resolvedFilters.monitorIds)) {
        if (requestId !== analyticsRequestRef.current) return;
        setReport(null);
        resolvedFilters = reconcileFiltersWithCatalog(
          { ...resolvedFilters, monitorIds: [] },
          activeMonitors,
          relevantCompanies
        );
        ({ response: reportResponse, data: reportData } = await requestAnalyticsReport(resolvedFilters));
        selectionReset = true;
        setFilters((currentFilters) => reconcileFiltersWithCatalog(
          { ...currentFilters, monitorIds: [] },
          activeMonitors,
          relevantCompanies
        ));
      }
      if (!reportResponse.ok || !reportData.report) throw new Error(reportData.message ?? "Unable to load analytics.");
      if (requestId !== analyticsRequestRef.current) return;
      setReport(reportData.report);
      setAppliedFilters(resolvedFilters);
      if (selectionReset) {
        setNotice(SELECTION_RESET_NOTICE);
      }
    } catch (loadError) {
      if (requestId !== analyticsRequestRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load analytics.");
    } finally {
      if (requestId === analyticsRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics(INITIAL_FILTERS);
  }, [loadAnalytics]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => subscribeToMonitorHistoryReset(() => {
    setReport(null);
    void loadAnalytics(filtersRef.current);
  }), [loadAnalytics]);

  return (
    <div className="space-y-5" aria-busy={loading}>
      {hasMonitors ? (
        <AnalyticsFilters
          filters={filters}
          monitors={monitors}
          companies={companies}
          loading={loading}
          invalidRange={invalidRange}
          onChange={setFilters}
          onApply={() => void loadAnalytics(filters)}
          onReset={() => {
            setFilters(INITIAL_FILTERS);
            void loadAnalytics(INITIAL_FILTERS);
          }}
        />
      ) : null}

      {notice ? (
        <p role="status" className="rounded-md bg-sky-500/10 px-4 py-3 text-sm text-sky-800 dark:text-sky-300">{notice}</p>
      ) : null}

      {error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-md bg-destructive/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void loadAnalytics(filters)}>Retry</Button>
        </div>
      ) : null}

      {!report && loading ? <p role="status" className="rounded-md bg-muted/20 px-4 py-8 text-sm text-muted-foreground">Loading reliability analytics…</p> : null}
      {!loading && !error && !hasMonitors ? <NoMonitorsAnalytics /> : null}
      {report && hasMonitors ? <AnalyticsReport report={report} filters={appliedFilters} refreshing={loading} /> : null}
    </div>
  );
}

function AnalyticsFilters({
  filters,
  monitors,
  companies,
  loading,
  invalidRange,
  onChange,
  onApply,
  onReset,
}: {
  filters: AnalyticsFilters;
  monitors: MonitorOption[];
  companies: CompanyOption[];
  loading: boolean;
  invalidRange: boolean;
  onChange: (filters: AnalyticsFilters) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const tags = Array.from(new Map(
    monitors.flatMap((monitor) => monitor.tags).map((tag) => [tag.toLowerCase(), tag] as const)
  ).values()).sort((left, right) => left.localeCompare(right));
  const visibleMonitors = monitors.filter((monitor) => !isMonitorExcludedByFilters(monitor, filters));
  const visibleCompanies = companies.filter((company) => !filters.excludeCompanyIds.includes(company.id));
  const scopedMonitors = visibleMonitors.filter((monitor) => filters.companyId === "all" || monitor.companyId === filters.companyId);
  const exclusionCount = countExclusions(filters);

  function updateExclusion(
    key: "excludeMonitorIds" | "excludeTags" | "excludeCompanyIds",
    value: string,
    excluded: boolean
  ) {
    const current = filters[key];
    const nextValues = changeExclusionSelection(current, value, excluded, key === "excludeTags");
    const nextFilters = { ...filters, [key]: nextValues };
    const companyId = key === "excludeCompanyIds" && nextValues.includes(filters.companyId)
      ? "all"
      : filters.companyId;
    onChange({
      ...nextFilters,
      companyId,
      monitorIds: filters.monitorIds.filter((monitorId) => {
        const monitor = monitors.find((item) => item.id === monitorId);
        return monitor && !isMonitorExcludedByFilters(monitor, nextFilters);
      }),
    });
  }

  function updateCompany(companyId: string) {
    onChange({
      ...filters,
      companyId,
      monitorIds: filters.monitorIds.filter((monitorId) => {
        const monitor = monitors.find((item) => item.id === monitorId);
        return monitor && (companyId === "all" || monitor.companyId === companyId);
      }),
    });
  }

  return (
    <section className="rounded-lg bg-surface-low px-3 py-4 shadow-sm sm:px-4" aria-label="Reliability analytics filters">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[180px_240px_minmax(280px,1fr)_auto]">
        <div className="space-y-2">
          <Label htmlFor="analytics-period">Period</Label>
          <Select value={filters.periodRange} onValueChange={(value) => onChange({ ...filters, periodRange: value as ReportPeriodRange })}>
            <SelectTrigger id="analytics-period"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="custom">Custom dates</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="analytics-company">Company</Label>
          <Select value={filters.companyId} onValueChange={(value) => updateCompany(String(value))}>
            <SelectTrigger id="analytics-company"><SelectValue placeholder="All companies" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {visibleCompanies.map((company) => (
                <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium leading-none">Monitors</p>
          <MonitorSelectionPicker
            monitors={scopedMonitors}
            selected={filters.monitorIds}
            onChange={(monitorIds) => onChange({
              ...filters,
              monitorIds,
            })}
          />
        </div>
        {filters.periodRange === "custom" ? (
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2 xl:col-span-3">
            <div className="space-y-2">
              <Label htmlFor="analytics-from">From</Label>
              <Input id="analytics-from" type="date" value={filters.startedAt} aria-invalid={invalidRange} aria-describedby={invalidRange ? "analytics-range-error" : undefined} onChange={(event) => onChange({ ...filters, startedAt: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="analytics-through">Through</Label>
              <Input id="analytics-through" type="date" min={filters.startedAt || undefined} value={filters.endedAt} aria-invalid={invalidRange} aria-describedby={invalidRange ? "analytics-range-error" : undefined} onChange={(event) => onChange({ ...filters, endedAt: event.target.value })} />
            </div>
          </div>
        ) : null}
        <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-1 xl:justify-end">
          <Button className="min-w-28" onClick={onApply} disabled={loading || invalidRange}>
            <RefreshCw data-icon="inline-start" className={cn("size-4", loading && "animate-spin motion-reduce:animate-none")} />
            {loading ? "Refreshing" : "Refresh"}
          </Button>
          <Button className="min-w-20" variant="outline" onClick={onReset} disabled={loading}>Reset</Button>
        </div>
      </div>
      {invalidRange ? <p id="analytics-range-error" className="mt-2 text-xs text-destructive">Choose both dates, with the start on or before the end date.</p> : null}
      <div className="mt-4 rounded-md bg-muted/20 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-md">
            <p className="text-sm font-medium">Exclude from analytics</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Remove noisy monitors or whole cohorts before calculating every metric.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:w-[660px]">
            <ExclusionPicker
              label="Monitors"
              searchable
              options={monitors.map((monitor) => ({ value: monitor.id, label: monitor.name, detail: monitor.url }))}
              selected={filters.excludeMonitorIds}
              onChange={(value, excluded) => updateExclusion("excludeMonitorIds", value, excluded)}
            />
            <ExclusionPicker
              label="Tags"
              options={tags.map((tag) => ({ value: tag, label: tag }))}
              selected={filters.excludeTags}
              caseInsensitive
              onChange={(value, excluded) => updateExclusion("excludeTags", value, excluded)}
            />
            <ExclusionPicker
              label="Companies"
              options={companies.map((company) => ({ value: company.id, label: company.name }))}
              selected={filters.excludeCompanyIds}
              onChange={(value, excluded) => updateExclusion("excludeCompanyIds", value, excluded)}
            />
          </div>
        </div>
        {exclusionCount > 0 ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-background/30 px-3 py-2 text-xs">
            <p className="text-muted-foreground">{formatExclusionSummary(filters)}. Changes apply when you refresh.</p>
            <button
              type="button"
              className="shrink-0 font-medium text-foreground underline underline-offset-4"
              onClick={() => onChange({ ...filters, excludeMonitorIds: [], excludeTags: [], excludeCompanyIds: [] })}
            >
              Clear exclusions
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function NoMonitorsAnalytics() {
  return (
    <section className="rounded-lg bg-card/45 p-6" aria-labelledby="analytics-no-monitors-title">
      <h2 id="analytics-no-monitors-title" className="text-base font-medium">Add a monitor to view reliability analytics</h2>
      <p className="mt-1 text-sm text-muted-foreground">Analytics becomes available after a monitor has recorded checks.</p>
      <Link className="mt-3 inline-flex text-sm font-medium text-primary underline underline-offset-4" href="/monitoring">Go to monitoring</Link>
    </section>
  );
}

function MonitorSelectionPicker({
  monitors,
  selected,
  onChange,
}: {
  monitors: MonitorOption[];
  selected: string[];
  onChange: (monitorIds: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const filteredMonitors = normalizedSearch
    ? monitors.filter((monitor) => `${monitor.name} ${monitor.url}`.toLowerCase().includes(normalizedSearch))
    : monitors;
  const visibleMonitors = filteredMonitors.slice(0, MAX_VISIBLE_MONITOR_OPTIONS);
  const selectedIds = new Set(selected);
  const summary = selected.length === 0
    ? "All monitors"
    : `${selected.length} monitor${selected.length === 1 ? "" : "s"} selected`;

  return (
    <details className="group relative">
      <summary
        className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
        aria-label={`Monitors: ${summary}`}
      >
        <span className="truncate">{summary}</span>
        <span className="text-xs text-muted-foreground">Choose</span>
      </summary>
      <div className="mt-1 rounded-md border border-border bg-popover p-2 shadow-lg sm:absolute sm:left-0 sm:z-30 sm:w-[26rem]">
        <div className="flex items-center gap-2 border-b border-border/70 p-1 pb-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search monitors"
            aria-label="Search monitors"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(monitors.map((monitor) => monitor.id))}
            disabled={monitors.length === 0 || selected.length === monitors.length}
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange([])}
            disabled={selected.length === 0}
          >
            Clear
          </Button>
        </div>
        <fieldset className="mt-1">
          <legend className="sr-only">Monitors included in analytics</legend>
          <div className="grid max-h-64 gap-1 overflow-y-auto">
            {filteredMonitors.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">No matching monitors.</p>
            ) : visibleMonitors.map((monitor) => {
              const checked = selectedIds.has(monitor.id);
              return (
                <label key={monitor.id} className="flex cursor-pointer items-start gap-3 px-2 py-2.5 hover:bg-muted/60">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={checked}
                    onChange={(event) => onChange(changeMonitorSelection(selected, monitor.id, event.target.checked))}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium" title={monitor.name}>{monitor.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={monitor.url}>{monitor.url}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {filteredMonitors.length > visibleMonitors.length ? (
            <p className="border-t border-border/70 px-2 pt-2 text-xs text-muted-foreground">
              Showing the first {visibleMonitors.length} of {filteredMonitors.length}. Search to narrow the list.
            </p>
          ) : null}
        </fieldset>
      </div>
    </details>
  );
}

function ExclusionPicker({
  label,
  options,
  selected,
  caseInsensitive = false,
  searchable = false,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string; detail?: string }>;
  selected: string[];
  caseInsensitive?: boolean;
  searchable?: boolean;
  onChange: (value: string, excluded: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const limitReached = selected.length >= MAX_EXCLUSIONS_PER_GROUP;
  const filteredOptions = searchable ? filterExclusionOptions(options, search) : options;
  return (
    <details className="group relative">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 rounded-md bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span>Exclude {label.toLocaleLowerCase()}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{selected.length || "None"}</span>
      </summary>
      <div className="mt-1 rounded-md bg-background p-2 shadow-lg sm:absolute sm:right-0 sm:z-20 sm:w-80">
        {searchable ? <Input
          className="mb-2"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search monitors"
          aria-label="Search excluded monitors"
        /> : null}
        <fieldset>
          <legend className="sr-only">{`Exclude ${label.toLocaleLowerCase()} from analytics`}</legend>
          <div className="max-h-56 grid gap-1 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">No {label.toLocaleLowerCase()} available.</p>
            ) : filteredOptions.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">No matching monitors.</p>
            ) : filteredOptions.map((option) => {
              const checked = isExclusionSelected(selected, option.value, caseInsensitive);
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 px-2 py-2.5 hover:bg-muted/60",
                    limitReached && !checked && "cursor-not-allowed opacity-60"
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={checked}
                    disabled={limitReached && !checked}
                    onChange={(event) => onChange(option.value, event.target.checked)}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium" title={option.label}>{option.label}</span>
                    {option.detail ? <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={option.detail}>{option.detail}</span> : null}
                  </span>
                </label>
              );
            })}
          </div>
          {limitReached ? <p className="rounded-md bg-muted/25 px-2 py-2 text-xs text-muted-foreground">Maximum {MAX_EXCLUSIONS_PER_GROUP} selections reached.</p> : null}
        </fieldset>
      </div>
    </details>
  );
}

function AnalyticsReport({ report, filters, refreshing }: { report: GeneratedReport; filters: AnalyticsFilters; refreshing: boolean }) {
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const hasChecks = report.summary.hasCompletedChecks;
  const exclusionCount = countExclusions(filters);
  const scopeLabel = filters.monitorIds.length > 1
    ? `${filters.monitorIds.length} selected monitors`
    : report.monitorName ?? report.companyName ?? "All monitors";

  async function exportPdf() {
    setExportingPdf(true);
    setExportError(null);
    try {
      const response = await fetch("/api/reports/analytics/pdf", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAnalyticsRequestPayload(filters)),
      });
      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        throw new Error(data.message ?? "Unable to generate the PDF.");
      }
      const filename = response.headers.get("X-Report-Filename") ?? `${buildReportFileSlug(report)}.pdf`;
      downloadBlob(await response.blob(), filename);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Unable to generate the PDF.");
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 rounded-md bg-muted/20 p-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Reliability over time</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {scopeLabel} · {report.periodLabel} · {report.timeZone}
            {exclusionCount > 0 ? ` · ${formatExclusionSummary(filters)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <p className="mr-1 text-xs text-muted-foreground" aria-live="polite">
            {refreshing ? "Refreshing data…" : `Updated ${formatPanelDateTime(report.generatedAt)}`}
          </p>
          <Button size="sm" variant="outline" disabled={refreshing || exportingPdf} onClick={() => downloadFile(buildPrintableReportHtml(report), `${buildReportFileSlug(report)}.html`, "text/html;charset=utf-8")}>Export HTML</Button>
          <Button size="sm" variant="outline" disabled={refreshing || exportingPdf} onClick={() => void exportPdf()}>{exportingPdf ? "Generating PDF…" : "Generate PDF"}</Button>
        </div>
      </header>
      <p className="-mt-4 text-xs text-muted-foreground lg:text-right">HTML saves the displayed snapshot; PDF uses the latest checks for these filters.</p>
      {exportError ? <p role="alert" className="text-sm text-destructive">{exportError} Try again.</p> : null}
      <span className="sr-only" role="status">{exportingPdf ? "Generating PDF report" : ""}</span>

      <SummaryStrip report={report} />
      <ReportComparison report={report} />

      {!hasChecks ? (
        <section className="rounded-lg bg-card/45 p-8">
          <h3 className="text-base font-medium">No completed checks in this period</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {exclusionCount > 0 ? "The current exclusions removed every completed check. Clear an exclusion or widen the period." : "Try a longer period or select another monitor."}
          </p>
        </section>
      ) : (
        <>
          <ExecutiveBrief report={report} />
          <div className="grid gap-6 xl:grid-cols-2">
            <AvailabilityChart data={report.dailyMetrics} />
            <FailureChart data={report.dailyMetrics} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <LatencyChart data={report.dailyMetrics} />
            <MonitorRiskMatrix report={report} />
          </div>
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <FailureConcentration report={report} />
            <FleetHealthDistribution monitors={report.monitorBreakdown} />
          </div>
          <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
            <StatusCodeDistribution codes={report.statusCodes} />
            <MonitorRiskTable report={report} />
          </div>
        </>
      )}
    </div>
  );
}

function ExecutiveBrief({ report }: { report: GeneratedReport }) {
  const insights = getExecutiveInsights(report);
  const signals = [
    {
      label: "Days at 99.9% reference",
      value: `${insights.daysAtReference} / ${insights.observedDays}`,
      detail: "Observed days with completed checks",
    },
    {
      label: "Monitors below reference",
      value: String(insights.belowReference),
      detail: `${insights.missingData} without completed checks`,
    },
    {
      label: "Largest failure contributor",
      value: insights.leadingFailure ? `${insights.leadingFailure.sharePct.toFixed(1)}%` : "None",
      detail: insights.leadingFailure ? `${insights.leadingFailure.name} · ${insights.leadingFailure.failures} failed checks` : "No failed checks in scope",
    },
  ];
  return (
    <section aria-labelledby="executive-brief-title" className="border-y border-border/70 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="executive-brief-title" className="text-base font-semibold">Executive brief</h3>
        <p className="text-xs text-muted-foreground">99.9% is a reference threshold, not a configured SLA.</p>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-4 md:grid-cols-3">
        {signals.map((signal) => <div key={signal.label} className="min-w-0 border-t border-border/60 pt-3">
          <dt className="text-xs text-muted-foreground">{signal.label}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{signal.value}</dd>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={signal.detail}>{signal.detail}</p>
        </div>)}
      </dl>
    </section>
  );
}

function AvailabilityChart({ data }: { data: GeneratedReport["dailyMetrics"] }) {
  const observed = data.filter((day) => day.upChecks + day.downChecks > 0);
  const maxBars = 45;
  const bucketSize = Math.max(1, Math.ceil(data.length / maxBars));
  const buckets = Array.from({ length: Math.ceil(data.length / bucketSize) }, (_, index) => {
    const days = data.slice(index * bucketSize, (index + 1) * bucketSize);
    const completed = days.reduce((sum, day) => sum + day.upChecks + day.downChecks, 0);
    return {
      date: days[0].date,
      label: days.length === 1 ? shortDate(days[0].date) : `${shortDate(days[0].date)}–${shortDate(days[days.length - 1].date)}`,
      uptimePct: completed ? days.reduce((sum, day) => sum + day.upChecks, 0) / completed * 100 : null,
    };
  });
  const referenceY = 178 - AVAILABILITY_REFERENCE_PCT / 100 * 150;
  return <ChartSection title="Availability trend" description={bucketSize === 1 ? "Daily availability from completed checks against a 99.9% reference." : "Completed-check-weighted availability by interval against a 99.9% reference."} legend="Availability" legendTone="bg-emerald-500">
    {observed.length === 0 ? <p className="py-8 text-sm text-muted-foreground">No completed checks to chart.</p> : <>
      <svg viewBox="0 0 720 230" className="w-full" style={{ minWidth: chartMinWidth(buckets.length) }} role="img" aria-label="Availability percentage by period against a 99.9 percent reference" aria-describedby="availability-values">
        <ChartAxis />
        <line x1="42" x2="700" y1={referenceY} y2={referenceY} className="stroke-amber-500" strokeDasharray="4 4" />
        <text x="36" y="31" textAnchor="end" className="fill-muted-foreground text-[10px]">100%</text>
        <text x="36" y="181" textAnchor="end" className="fill-muted-foreground text-[10px]">0%</text>
        {buckets.map((bucket, index) => {
          const x = chartX(index, buckets.length);
          const height = bucket.uptimePct === null ? 0 : bucket.uptimePct / 100 * 150;
          return <g key={bucket.date}>
            <rect x={x - 6} y={178 - height} width="12" height={height} className={bucket.uptimePct !== null && bucket.uptimePct < AVAILABILITY_REFERENCE_PCT ? "fill-rose-500" : "fill-emerald-500"} />
            {showDateLabel(index, buckets.length) ? <text x={x} y="207" textAnchor="middle" className="fill-muted-foreground text-[10px]">{bucket.label}</text> : null}
            <title>{`${bucket.label}: ${bucket.uptimePct === null ? "no completed checks" : `${bucket.uptimePct.toFixed(2)}% availability`}`}</title>
          </g>;
        })}
      </svg>
      <p id="availability-values" className="sr-only">{buckets.map((bucket) => `${bucket.label}: ${bucket.uptimePct === null ? "no completed checks" : `${bucket.uptimePct.toFixed(2)} percent`}`).join("; ")}</p>
    </>}
  </ChartSection>;
}

function MonitorRiskMatrix({ report }: { report: GeneratedReport }) {
  const { monitors, medianLatencyMs } = getMonitorRiskPoints(report);
  const points = monitors.toSorted((left, right) => left.uptimePct - right.uptimePct || right.p95LatencyMs - left.p95LatencyMs).slice(0, 40);
  const maxLatency = Math.max(1, ...points.map((monitor) => monitor.p95LatencyMs));
  const latencyThreshold = medianLatencyMs ?? 0;
  const riskCount = monitors.filter((monitor) => monitor.uptimePct < AVAILABILITY_REFERENCE_PCT && monitor.p95LatencyMs > latencyThreshold).length;
  return <ChartSection title="Reliability and latency risk" description={`Monitor P95 latency versus uptime. ${riskCount} below 99.9% and above the fleet median P95 (${Math.round(latencyThreshold)}ms).`} legend="Monitor" legendTone="bg-cyan-500">
    {points.length === 0 ? <p className="py-8 text-sm text-muted-foreground">No monitors have both completed checks and latency samples.</p> : <>
      {monitors.length > points.length ? <p className="mb-2 text-xs text-muted-foreground">Showing the {points.length} lowest-uptime monitors of {monitors.length} with latency data.</p> : null}
      <svg viewBox="0 0 720 230" className="w-full" style={{ minWidth: "320px" }} role="img" aria-label="Monitor uptime and P95 latency comparison" aria-describedby="risk-matrix-values">
        <ChartAxis />
        <line x1={50 + ((AVAILABILITY_REFERENCE_PCT - 95) / 5) * 640} x2={50 + ((AVAILABILITY_REFERENCE_PCT - 95) / 5) * 640} y1="28" y2="178" strokeDasharray="4 4" className="stroke-amber-500" />
        {latencyThreshold <= maxLatency ? <line x1="42" x2="700" y1={178 - latencyThreshold / maxLatency * 150} y2={178 - latencyThreshold / maxLatency * 150} strokeDasharray="4 4" className="stroke-muted-foreground/70" /> : null}
        <text x="36" y="31" textAnchor="end" className="fill-muted-foreground text-[10px]">{maxLatency}ms</text>
        <text x="50" y="207" textAnchor="start" className="fill-muted-foreground text-[10px]">≤95%</text>
        <text x="690" y="207" textAnchor="end" className="fill-muted-foreground text-[10px]">100% uptime</text>
        {points.map((monitor) => <circle key={monitor.monitorId} cx={50 + Math.max(0, (monitor.uptimePct - 95) / 5) * 640} cy={178 - monitor.p95LatencyMs / maxLatency * 150} r="5" className={monitor.uptimePct < AVAILABILITY_REFERENCE_PCT && monitor.p95LatencyMs > latencyThreshold ? "fill-rose-500" : "fill-cyan-500"}>
          <title>{`${monitor.name}: ${monitor.uptimePct.toFixed(2)}% uptime, ${monitor.p95LatencyMs}ms P95`}</title>
        </circle>)}
      </svg>
      <p id="risk-matrix-values" className="sr-only">{points.map((monitor) => `${monitor.name}: ${monitor.uptimePct.toFixed(2)} percent uptime, ${monitor.p95LatencyMs} milliseconds P95`).join("; ")}</p>
    </>}
  </ChartSection>;
}

function SummaryStrip({ report }: { report: GeneratedReport }) {
  const metrics = [
    { label: "Uptime", value: formatReportUptime(report.summary), detail: `${report.summary.upChecks.toLocaleString("en-GB")} successful checks`, tone: "text-emerald-500" },
    { label: "Failed checks", value: report.summary.failureEvents.toLocaleString("en-GB"), detail: `${formatReportFailureRate(report.summary)} of completed checks`, tone: report.summary.failureEvents > 0 ? "text-rose-500" : "text-emerald-500" },
    {
      label: "P95 latency",
      value: formatReportP95Latency(report.summary),
      detail: report.summary.hasLatencySamples
        ? `${report.summary.averageLatencyMs.toLocaleString("en-GB")}ms average`
        : "No latency samples",
      tone: report.summary.hasLatencySamples ? "text-amber-500" : "text-foreground",
    },
    { label: "Impacted monitors", value: report.summary.impactedMonitors.toLocaleString("en-GB"), detail: `${report.summary.monitorCount.toLocaleString("en-GB")} in scope · ${report.summary.currentlyPaused.toLocaleString("en-GB")} paused now`, tone: report.summary.impactedMonitors > 0 ? "text-rose-500" : "text-foreground" },
  ];
  return (
    <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-md bg-card/55 px-3 py-3">
          <dt className="text-xs font-medium text-muted-foreground">{metric.label}</dt>
          <dd className={cn("mt-1 text-xl font-semibold tabular-nums", metric.tone)}>{metric.value}</dd>
          <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
        </div>
      ))}
    </dl>
  );
}

function FailureChart({ data }: { data: GeneratedReport["dailyMetrics"] }) {
  const { points, bucketSize } = prepareChartData(data);
  const { hasFailures } = getChartAvailability(data);
  const max = Math.max(1, ...points.map((item) => item.downChecks));
  const descriptionId = "daily-failure-values";
  const intervalLabel = bucketSize === 1 ? "day" : `${bucketSize}-day interval`;
  return (
    <ChartSection title={`Failed checks by ${intervalLabel}`} description="Confirmed failed checks; use clusters to identify unstable periods." legend="Failed checks" legendTone="bg-rose-500">
      {!hasFailures ? (
        <p className="py-8 text-sm text-muted-foreground">No failed checks were recorded in this period.</p>
      ) : <svg viewBox="0 0 720 230" className="w-full" style={{ minWidth: chartMinWidth(points.length) }} role="img" aria-label={`Failed check counts by ${intervalLabel}`} aria-describedby={descriptionId}>
        <ChartAxis />
        <text x="36" y="31" textAnchor="end" className="fill-muted-foreground text-[10px]">{max}</text>
        <text x="36" y="181" textAnchor="end" className="fill-muted-foreground text-[10px]">0</text>
        {points.map((item, index) => {
          const x = chartX(index, points.length);
          const height = (item.downChecks / max) * 150;
          return (
            <g key={item.date}>
              <rect x={x - 7} y={178 - height} width="14" height={height} rx="2" className="fill-rose-500" />
              {showDateLabel(index, points.length) ? <text x={x} y="207" textAnchor="middle" className="fill-muted-foreground text-[10px]">{item.label}</text> : null}
              <title>{`${item.label}: ${item.downChecks} failed checks`}</title>
            </g>
          );
        })}
      </svg>}
      {hasFailures ? <p id={descriptionId} className="sr-only">{points.map((item) => `${item.label}: ${item.downChecks} failed checks`).join("; ")}</p> : null}
    </ChartSection>
  );
}

function LatencyChart({ data }: { data: GeneratedReport["dailyMetrics"] }) {
  const { points, bucketSize } = prepareChartData(data);
  const { hasLatencySamples } = getChartAvailability(data);
  const max = Math.max(1, ...points.flatMap((item) => item.p95LatencyMs === null ? [] : [item.p95LatencyMs]));
  const descriptionId = "daily-latency-values";
  const intervalLabel = bucketSize === 1 ? "day" : `${bucketSize}-day interval`;
  return (
    <ChartSection title={`${bucketSize === 1 ? "P95" : "Peak daily P95"} latency by ${intervalLabel}`} description={bucketSize === 1 ? "Tail latency highlights slow periods hidden by the average." : "Long ranges show the highest daily P95 in each interval so slow periods remain visible."} legend="P95 latency" legendTone="bg-amber-500">
      {!hasLatencySamples ? (
        <p className="py-8 text-sm text-muted-foreground">No latency samples were recorded in this period.</p>
      ) : <svg viewBox="0 0 720 230" className="w-full" style={{ minWidth: chartMinWidth(points.length) }} role="img" aria-label={`${bucketSize === 1 ? "Daily" : "Peak daily"} p95 latency in milliseconds by ${intervalLabel}`} aria-describedby={descriptionId}>
        <ChartAxis />
        <text x="36" y="31" textAnchor="end" className="fill-muted-foreground text-[10px]">{max}ms</text>
        <text x="36" y="181" textAnchor="end" className="fill-muted-foreground text-[10px]">0</text>
        {buildLatencySegments(points, max).map((segment) => (
          <polyline key={segment} points={segment} fill="none" stroke="currentColor" strokeWidth="3" className="text-amber-500" />
        ))}
        {points.map((item, index) => {
          if (item.p95LatencyMs === null) return null;
          const x = chartX(index, points.length);
          const y = 178 - (item.p95LatencyMs / max) * 150;
          return (
            <g key={item.date}>
              <circle cx={x} cy={y} r="3.5" className="fill-amber-500" />
              {showDateLabel(index, points.length) ? <text x={x} y="207" textAnchor="middle" className="fill-muted-foreground text-[10px]">{item.label}</text> : null}
              <title>{`${item.label}: ${item.p95LatencyMs}ms p95 latency`}</title>
            </g>
          );
        })}
      </svg>}
      {hasLatencySamples ? <p id={descriptionId} className="sr-only">{points.map((item) => `${item.label}: ${item.p95LatencyMs === null ? "no latency sample" : `${item.p95LatencyMs} milliseconds p95`}`).join("; ")}</p> : null}
    </ChartSection>
  );
}

function ChartSection({ title, description, legend, legendTone, children }: { title: string; description: string; legend: string; legendTone: string; children: ReactNode }) {
  return (
    <section className="rounded-lg bg-card/45 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-medium">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className={cn("h-0.5 w-4", legendTone)} />{legend}</span>
      </div>
      <div className="mt-4 overflow-x-auto">{children}</div>
    </section>
  );
}

function ChartAxis() {
  return <line x1="42" y1="178" x2="700" y2="178" className="stroke-border" strokeWidth="1" />;
}

const FAILURE_SEGMENT_TONES = [
  { stroke: "stroke-rose-500", swatch: "bg-rose-500" },
  { stroke: "stroke-amber-500", swatch: "bg-amber-500" },
  { stroke: "stroke-cyan-500", swatch: "bg-cyan-500" },
  { stroke: "stroke-lime-500", swatch: "bg-lime-500" },
  { stroke: "stroke-slate-500", swatch: "bg-slate-500" },
] as const;

function FailureConcentration({ report }: { report: GeneratedReport }) {
  const segments = buildFailureSegments(report.monitorBreakdown);
  const total = segments.reduce((sum, segment) => sum + segment.failures, 0);

  return (
    <section className="rounded-lg bg-card/45 p-4">
      <h3 className="text-base font-medium">Failure concentration</h3>
      <p className="mt-1 text-sm text-muted-foreground">Shows which monitors account for the selected period&apos;s failed checks.</p>
      {total === 0 ? (
        <p className="mt-4 py-6 text-sm text-muted-foreground">No failed checks to distribute.</p>
      ) : (
        <div className="mt-4 grid items-center gap-5 sm:grid-cols-[180px_1fr]">
          <svg viewBox="0 0 160 160" className="mx-auto size-44" role="img" aria-label={`${total} failed checks distributed across ${segments.length} monitor groups`}>
            <circle cx="80" cy="80" r="56" fill="none" className="stroke-muted" strokeWidth="22" />
            {segments.map((segment, index) => {
              const percentage = (segment.failures / total) * 100;
              const precedingFailures = segments
                .slice(0, index)
                .reduce((sum, precedingSegment) => sum + precedingSegment.failures, 0);
              const dashOffset = -(precedingFailures / total) * 100;
              return (
                <circle
                  key={segment.id}
                  cx="80"
                  cy="80"
                  r="56"
                  pathLength="100"
                  fill="none"
                  strokeWidth="22"
                  strokeDasharray={`${percentage} ${100 - percentage}`}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 80 80)"
                  className={FAILURE_SEGMENT_TONES[index].stroke}
                >
                  <title>{`${segment.label}: ${segment.failures} failed checks (${percentage.toFixed(1)}%)`}</title>
                </circle>
              );
            })}
            <text x="80" y="76" textAnchor="middle" className="fill-foreground text-[24px] font-semibold tabular-nums">{total}</text>
            <text x="80" y="96" textAnchor="middle" className="fill-muted-foreground text-[10px]">failed checks</text>
          </svg>
          <ol className="grid gap-1">
            {segments.map((segment, index) => (
              <li key={segment.id} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-muted/20 px-2 py-2 text-sm">
                <span className={cn("size-2", FAILURE_SEGMENT_TONES[index].swatch)} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate" title={segment.label}>{segment.label}</span>
                  {segment.detail ? <span className="block truncate text-xs text-muted-foreground" title={segment.detail}>{segment.detail}</span> : null}
                </span>
                <span className="tabular-nums text-muted-foreground">{segment.failures.toLocaleString("en-GB")} · {((segment.failures / total) * 100).toFixed(1)}%</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function FleetHealthDistribution({ monitors }: { monitors: GeneratedReport["monitorBreakdown"] }) {
  const bands = [
    { label: "Healthy", detail: "99.9% and above", count: monitors.filter((monitor) => monitor.hasCompletedChecks && monitor.uptimePct >= 99.9).length, tone: "bg-emerald-500" },
    { label: "Watch", detail: "At least 99.00%, below 99.90%", count: monitors.filter((monitor) => monitor.hasCompletedChecks && monitor.uptimePct >= 99 && monitor.uptimePct < 99.9).length, tone: "bg-amber-500" },
    { label: "At risk", detail: "Below 99.0%", count: monitors.filter((monitor) => monitor.hasCompletedChecks && monitor.uptimePct < 99).length, tone: "bg-rose-500" },
    { label: "No data", detail: "No completed checks", count: monitors.filter((monitor) => !monitor.hasCompletedChecks).length, tone: "bg-slate-500" },
  ];
  const total = monitors.length;

  return (
    <section className="rounded-lg bg-card/45 p-4">
      <h3 className="text-base font-medium">Fleet reliability bands</h3>
      <p className="mt-1 text-sm text-muted-foreground">Separates stable monitors from those that need investigation.</p>
      {total === 0 ? (
        <p className="mt-4 py-6 text-sm text-muted-foreground">No monitors remain in the current scope.</p>
      ) : (
        <>
          <div className="mt-5 flex h-4 overflow-hidden bg-muted" role="img" aria-label={bands.map((band) => `${band.label}: ${band.count}`).join(", ")}>
            {bands.map((band) => band.count > 0 ? (
              <div key={band.label} className={band.tone} style={{ width: `${(band.count / total) * 100}%` }} title={`${band.label}: ${band.count}`} />
            ) : null)}
          </div>
          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {bands.map((band) => (
              <div key={band.label} className="grid grid-cols-[10px_1fr_auto] items-center gap-2">
                <span className={cn("size-2", band.tone)} aria-hidden="true" />
                <div><dt className="text-sm font-medium">{band.label}</dt><p className="text-xs text-muted-foreground">{band.detail}</p></div>
                <dd className="text-sm font-semibold tabular-nums">{band.count}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}

function StatusCodeDistribution({ codes }: { codes: GeneratedReport["statusCodes"] }) {
  const max = Math.max(1, ...codes.map((item) => item.count));
  return (
    <section className="rounded-lg bg-card/45 p-4">
      <h3 className="text-base font-medium">HTTP response mix</h3>
      <p className="mt-1 text-sm text-muted-foreground">Most common recorded response codes.</p>
      <div className="mt-4 grid gap-1">
        {codes.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No HTTP status codes in this period.</p> : codes.map((item) => (
          <div key={item.statusCode} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 py-3">
            <span className="text-sm font-medium tabular-nums">HTTP {item.statusCode}</span>
            <div className="h-2 bg-muted" aria-hidden="true"><div className="h-full min-w-px bg-sky-500" style={{ width: `${(item.count / max) * 100}%` }} /></div>
            <span className="text-xs tabular-nums text-muted-foreground">{item.count.toLocaleString("en-GB")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MonitorRiskTable({ report }: { report: GeneratedReport }) {
  const rows = report.monitorBreakdown.slice(0, 12);
  const isTruncated = report.monitorBreakdown.length > rows.length;
  return (
    <section className="rounded-lg bg-card/45 p-4">
      <h3 className="text-base font-medium">Monitor failure ranking</h3>
      <p className="mt-1 text-sm text-muted-foreground">Highest failed-check count first, then average latency.</p>
      {isTruncated ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Showing the 12 highest-risk monitors out of {report.monitorBreakdown.length} in scope.{" "}
          <Link className="font-medium text-foreground underline underline-offset-4" href="/monitoring">View all monitors</Link>
        </p>
      ) : null}
      <div className="mt-3 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="py-2 pr-4 font-medium">Monitor</th><th className="px-3 py-2 text-right font-medium">Failures</th><th className="px-3 py-2 text-right font-medium">Uptime</th><th className="px-3 py-2 text-right font-medium">Average</th><th className="py-2 pl-3 text-right font-medium">P95</th></tr>
          </thead>
          <tbody>
            {rows.map((monitor) => (
              <tr key={monitor.monitorId}>
                <td className="max-w-[330px] py-3 pr-4"><p className="truncate font-medium" title={monitor.name}>{monitor.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground" title={monitor.url}>{monitor.url}</p></td>
                <td className={cn("px-3 py-3 text-right tabular-nums", monitor.failures > 0 && "text-rose-500")}>{monitor.failures.toLocaleString("en-GB")}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatMonitorUptime(monitor)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatMonitorAverageLatency(monitor)}</td>
                <td className="py-3 pl-3 text-right tabular-nums">{formatMonitorP95Latency(monitor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 grid gap-2 sm:hidden">
        {rows.map((monitor) => (
          <div key={monitor.monitorId} className="rounded-md bg-muted/20 p-3">
            <p className="truncate text-sm font-medium" title={monitor.name}>{monitor.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={monitor.url}>{monitor.url}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <MobileMetric label="Failures" value={monitor.failures.toLocaleString("en-GB")} tone={monitor.failures > 0 ? "text-rose-500" : undefined} />
              <MobileMetric label="Uptime" value={formatMonitorUptime(monitor)} />
              <MobileMetric label="Average" value={formatMonitorAverageLatency(monitor)} />
              <MobileMetric label="P95" value={formatMonitorP95Latency(monitor)} />
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

function MobileMetric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div><dt className="text-muted-foreground">{label}</dt><dd className={cn("mt-0.5 font-medium tabular-nums", tone)}>{value}</dd></div>;
}

async function requestAnalyticsReport(filters: AnalyticsFilters) {
  const response = await fetch("/api/reports/analytics", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildAnalyticsRequestPayload(filters)),
  });
  const data = (await response.json()) as { report?: GeneratedReport; message?: string };
  return { response, data };
}

function buildAnalyticsRequestPayload(filters: AnalyticsFilters) {
  const payload: Record<string, string | string[]> = {
    monitorIds: filters.monitorIds,
    excludeMonitorIds: filters.excludeMonitorIds,
    excludeTags: filters.excludeTags,
    excludeCompanyIds: filters.excludeCompanyIds,
  };
  for (const [key, value] of Object.entries(buildPeriodPayload(filters))) {
    if (value) payload[key] = value;
  }
  if (filters.companyId !== "all") payload.companyId = filters.companyId;
  return payload;
}

export function filterExclusionOptions<T extends { label: string; detail?: string }>(options: T[], query: string): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized ? options.filter((option) => `${option.label} ${option.detail ?? ""}`.toLocaleLowerCase().includes(normalized)) : options;
}

export function shouldRetryAnalyticsWithoutMonitor(status: number, monitorIds: string[]) {
  return status === 404 && monitorIds.length > 0;
}

export function reconcileFiltersWithCatalog(
  filters: AnalyticsFilters,
  monitors: MonitorOption[],
  companies: CompanyOption[]
): AnalyticsFilters {
  const monitorIds = new Set(monitors.map((monitor) => monitor.id));
  const companyIds = new Set(companies.map((company) => company.id));
  const tags = new Set(monitors.flatMap((monitor) => monitor.tags).map((tag) => tag.toLowerCase()));
  const validCompanyId = filters.companyId === "all" || companyIds.has(filters.companyId)
    ? filters.companyId
    : "all";
  const companyId = validCompanyId !== "all" && filters.excludeCompanyIds.includes(validCompanyId)
    ? "all"
    : validCompanyId;
  const reconciledFilters = {
    ...filters,
    companyId,
    monitorIds: filters.monitorIds.filter((id) => monitorIds.has(id)),
    excludeMonitorIds: filters.excludeMonitorIds.filter((id) => monitorIds.has(id)),
    excludeTags: dedupeCaseInsensitive(filters.excludeTags.filter((tag) => tags.has(tag.toLowerCase()))),
    excludeCompanyIds: filters.excludeCompanyIds.filter((id) => companyIds.has(id)),
  };
  return {
    ...reconciledFilters,
    monitorIds: reconciledFilters.monitorIds.filter((monitorId) => {
      const monitor = monitors.find((item) => item.id === monitorId);
      return monitor
        && (reconciledFilters.companyId === "all" || monitor.companyId === reconciledFilters.companyId)
        && !isMonitorExcludedByFilters(monitor, reconciledFilters);
    }),
  };
}

export function changeMonitorSelection(selected: string[], monitorId: string, shouldSelect: boolean) {
  if (shouldSelect) {
    return selected.includes(monitorId) ? selected : [...selected, monitorId];
  }
  return selected.filter((id) => id !== monitorId);
}

export function isMonitorExcludedByFilters(monitor: MonitorOption, filters: AnalyticsFilters) {
  const excludedTags = new Set(filters.excludeTags.map((tag) => tag.toLowerCase()));
  return filters.excludeMonitorIds.includes(monitor.id)
    || Boolean(monitor.companyId && filters.excludeCompanyIds.includes(monitor.companyId))
    || monitor.tags.some((tag) => excludedTags.has(tag.toLowerCase()));
}

export function isExclusionSelected(selected: string[], value: string, caseInsensitive = false) {
  const target = caseInsensitive ? value.toLowerCase() : value;
  return selected.some((item) => (caseInsensitive ? item.toLowerCase() : item) === target);
}

export function changeExclusionSelection(
  selected: string[],
  value: string,
  excluded: boolean,
  caseInsensitive = false
) {
  if (excluded) {
    if (isExclusionSelected(selected, value, caseInsensitive) || selected.length >= MAX_EXCLUSIONS_PER_GROUP) {
      return selected;
    }
    return [...selected, value];
  }
  const target = caseInsensitive ? value.toLowerCase() : value;
  return selected.filter((item) => (caseInsensitive ? item.toLowerCase() : item) !== target);
}

function dedupeCaseInsensitive(values: string[]) {
  return Array.from(new Map(values.map((value) => [value.toLowerCase(), value] as const)).values());
}

function countExclusions(filters: AnalyticsFilters) {
  return filters.excludeMonitorIds.length + filters.excludeTags.length + filters.excludeCompanyIds.length;
}

function formatExclusionSummary(filters: AnalyticsFilters) {
  const parts = [
    filters.excludeMonitorIds.length ? `${filters.excludeMonitorIds.length} monitor${filters.excludeMonitorIds.length === 1 ? "" : "s"}` : null,
    filters.excludeTags.length ? `${filters.excludeTags.length} tag${filters.excludeTags.length === 1 ? "" : "s"}` : null,
    filters.excludeCompanyIds.length ? `${filters.excludeCompanyIds.length} ${filters.excludeCompanyIds.length === 1 ? "company" : "companies"}` : null,
  ].filter(Boolean);
  return `Excluding ${parts.join(", ")}`;
}

export function buildFailureSegments(monitors: GeneratedReport["monitorBreakdown"]) {
  const failing = monitors
    .filter((monitor) => monitor.failures > 0)
    .toSorted((left, right) => right.failures - left.failures);
  const leading = failing.slice(0, 4).map((monitor) => ({
    id: monitor.monitorId,
    label: monitor.name,
    detail: monitor.url,
    failures: monitor.failures,
  }));
  const remainingFailures = failing.slice(4).reduce((total, monitor) => total + monitor.failures, 0);
  return remainingFailures > 0
    ? [...leading, { id: "other", label: "Other monitors", detail: null, failures: remainingFailures }]
    : leading;
}

function buildPeriodPayload(filters: AnalyticsFilters) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  if (filters.periodRange !== "custom") return { periodRange: filters.periodRange, timeZone };
  const startedAt = new Date(`${filters.startedAt}T00:00:00`);
  const endedAt = new Date(`${filters.endedAt}T00:00:00`);
  endedAt.setDate(endedAt.getDate() + 1);
  return { periodRange: "custom", periodStartedAt: startedAt.toISOString(), periodEndedAt: endedAt.toISOString(), timeZone };
}

function chartX(index: number, count: number) {
  return count <= 1 ? 370 : 50 + (index / (count - 1)) * 640;
}

function chartMinWidth(count: number) {
  return `${Math.min(960, Math.max(320, count * 24))}px`;
}

type ChartPoint = {
  date: string;
  label: string;
  downChecks: number;
  p95LatencyMs: number | null;
};

export function getChartAvailability(data: GeneratedReport["dailyMetrics"]) {
  return {
    hasFailures: data.some((item) => item.downChecks > 0),
    hasLatencySamples: data.some((item) => item.p95LatencyMs !== null),
  };
}

function prepareChartData(data: GeneratedReport["dailyMetrics"]): { points: ChartPoint[]; bucketSize: number } {
  const bucketSize = Math.max(1, Math.ceil(data.length / 45));
  const points: ChartPoint[] = [];
  for (let index = 0; index < data.length; index += bucketSize) {
    const bucket = data.slice(index, index + bucketSize);
    const latencyValues = bucket.flatMap((item) => item.p95LatencyMs === null ? [] : [item.p95LatencyMs]);
    const firstDate = bucket[0].date;
    const lastDate = bucket[bucket.length - 1].date;
    points.push({
      date: firstDate,
      label: bucket.length === 1 ? shortDate(firstDate) : `${shortDate(firstDate)}–${shortDate(lastDate)}`,
      downChecks: bucket.reduce((total, item) => total + item.downChecks, 0),
      p95LatencyMs: latencyValues.length === 0 ? null : Math.max(...latencyValues),
    });
  }
  return { points, bucketSize };
}

function buildLatencySegments(data: ChartPoint[], max: number) {
  const segments: string[] = [];
  let current: string[] = [];
  data.forEach((item, index) => {
    if (item.p95LatencyMs === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${chartX(index, data.length)},${178 - (item.p95LatencyMs / max) * 150}`);
  });
  if (current.length > 1) segments.push(current.join(" "));
  return segments;
}

function showDateLabel(index: number, count: number) {
  const interval = count <= 10 ? 1 : Math.ceil(count / 7);
  return index === 0 || index === count - 1 || index % interval === 0;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
