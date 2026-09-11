"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  formatMonitorAverageLatency,
  formatMonitorP95Latency,
  formatMonitorUptime,
  formatReportFailureRate,
  formatReportP95Latency,
  formatReportUptime,
} from "@/lib/reports/metrics";
import type { GeneratedReport, ReportPeriodRange } from "@/lib/reports/types";

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
  monitorId: string;
  startedAt: string;
  endedAt: string;
  excludeMonitorIds: string[];
  excludeTags: string[];
  excludeCompanyIds: string[];
};

const INITIAL_FILTERS: AnalyticsFilters = {
  periodRange: "7d",
  monitorId: "all",
  startedAt: "",
  endedAt: "",
  excludeMonitorIds: [],
  excludeTags: [],
  excludeCompanyIds: [],
};
const MAX_EXCLUSIONS_PER_GROUP = 100;
const SELECTION_RESET_NOTICE = "The selected monitor is no longer in the current analytics scope. Analytics now include all remaining monitors.";

export function ReportAnalyticsWorkspace() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_FILTERS);
  const [monitors, setMonitors] = useState<MonitorOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hasMonitors = monitors.length > 0;
  const invalidRange = filters.periodRange === "custom"
    && (!filters.startedAt || !filters.endedAt || filters.startedAt > filters.endedAt);

  const loadAnalytics = useCallback(async (nextFilters: AnalyticsFilters) => {
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

      const activeMonitors = (monitorsData.monitors ?? []).filter((monitor) => monitor.isActive);
      const activeCompanyIds = new Set(activeMonitors.flatMap((monitor) => monitor.companyId ? [monitor.companyId] : []));
      const relevantCompanies = (companiesData.companies ?? []).filter((company) => activeCompanyIds.has(company.id));
      let resolvedFilters = reconcileFiltersWithCatalog(nextFilters, activeMonitors, relevantCompanies);
      let selectionReset = nextFilters.monitorId !== "all" && resolvedFilters.monitorId === "all";
      setFilters((currentFilters) => reconcileFiltersWithCatalog(
        currentFilters,
        activeMonitors,
        relevantCompanies
      ));
      setMonitors(activeMonitors);
      setCompanies(relevantCompanies);

      let { response: reportResponse, data: reportData } = await requestAnalyticsReport(resolvedFilters);
      if (shouldRetryAnalyticsWithoutMonitor(reportResponse.status, resolvedFilters.monitorId)) {
        const removedMonitorId = resolvedFilters.monitorId;
        setReport(null);
        const remainingMonitors = activeMonitors.filter((monitor) => monitor.id !== removedMonitorId);
        const remainingCompanyIds = new Set(remainingMonitors.flatMap((monitor) => monitor.companyId ? [monitor.companyId] : []));
        const remainingCompanies = relevantCompanies.filter((company) => remainingCompanyIds.has(company.id));
        resolvedFilters = reconcileFiltersWithCatalog(
          { ...resolvedFilters, monitorId: "all" },
          remainingMonitors,
          remainingCompanies
        );
        ({ response: reportResponse, data: reportData } = await requestAnalyticsReport(resolvedFilters));
        selectionReset = true;
        setMonitors(remainingMonitors);
        setCompanies(remainingCompanies);
        setFilters((currentFilters) => reconcileFiltersWithCatalog(
          currentFilters.monitorId === removedMonitorId
            ? { ...currentFilters, monitorId: "all" }
            : currentFilters,
          remainingMonitors,
          remainingCompanies
        ));
      }
      if (!reportResponse.ok || !reportData.report) throw new Error(reportData.message ?? "Unable to load analytics.");
      setReport(reportData.report);
      setAppliedFilters(resolvedFilters);
      if (selectionReset) {
        setNotice(SELECTION_RESET_NOTICE);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics(INITIAL_FILTERS);
  }, [loadAnalytics]);

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
        <p role="status" className="border-y border-sky-700/40 py-3 text-sm text-sky-800 dark:text-sky-300">{notice}</p>
      ) : null}

      {error ? (
        <div role="alert" className="flex flex-col gap-3 border-y border-destructive/50 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void loadAnalytics(filters)}>Retry</Button>
        </div>
      ) : null}

      {!report && loading ? <p role="status" className="border-y py-8 text-sm text-muted-foreground">Loading reliability analytics…</p> : null}
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
  const exclusionCount = countExclusions(filters);

  function updateExclusion(
    key: "excludeMonitorIds" | "excludeTags" | "excludeCompanyIds",
    value: string,
    excluded: boolean
  ) {
    const current = filters[key];
    const nextValues = changeExclusionSelection(current, value, excluded, key === "excludeTags");
    const nextFilters = { ...filters, [key]: nextValues };
    const selectedMonitor = monitors.find((monitor) => monitor.id === filters.monitorId);
    onChange({
      ...nextFilters,
      monitorId: selectedMonitor && isMonitorExcludedByFilters(selectedMonitor, nextFilters) ? "all" : filters.monitorId,
    });
  }

  return (
    <section className="border-y bg-surface-low px-3 py-4 sm:px-4" aria-label="Reliability analytics filters">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[180px_minmax(240px,1fr)_160px_160px_auto]">
        <div className="space-y-1.5">
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
        <div className="space-y-1.5">
          <Label htmlFor="analytics-monitor">Monitor</Label>
          <Select value={filters.monitorId} onValueChange={(value) => onChange({ ...filters, monitorId: String(value) })}>
            <SelectTrigger id="analytics-monitor"><SelectValue placeholder="All monitors" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All monitors</SelectItem>
              {visibleMonitors.map((monitor) => (
                <SelectItem key={monitor.id} value={monitor.id}>{monitor.name} · {monitor.url}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {filters.periodRange === "custom" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="analytics-from">From</Label>
              <Input id="analytics-from" type="date" value={filters.startedAt} aria-invalid={invalidRange} aria-describedby={invalidRange ? "analytics-range-error" : undefined} onChange={(event) => onChange({ ...filters, startedAt: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="analytics-through">Through</Label>
              <Input id="analytics-through" type="date" min={filters.startedAt || undefined} value={filters.endedAt} aria-invalid={invalidRange} aria-describedby={invalidRange ? "analytics-range-error" : undefined} onChange={(event) => onChange({ ...filters, endedAt: event.target.value })} />
            </div>
          </>
        ) : (
          <div className="hidden xl:block" aria-hidden="true" />
        )}
        <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-1">
          <Button onClick={onApply} disabled={loading || invalidRange}>
            <RefreshCw className={cn("mr-2 size-4", loading && "animate-spin motion-reduce:animate-none")} />
            {loading ? "Refreshing" : "Refresh"}
          </Button>
          <Button variant="ghost" onClick={onReset} disabled={loading}>Reset</Button>
        </div>
      </div>
      {invalidRange ? <p id="analytics-range-error" className="mt-2 text-xs text-destructive">Choose both dates, with the start on or before the end date.</p> : null}
      <div className="mt-4 border-t pt-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-md">
            <p className="text-sm font-medium">Exclude from analytics</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Remove noisy monitors or whole cohorts before calculating every metric.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:w-[660px]">
            <ExclusionPicker
              label="Monitors"
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
          <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3 text-xs">
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
    <section className="border-y py-6" aria-labelledby="analytics-no-monitors-title">
      <h2 id="analytics-no-monitors-title" className="text-base font-medium">Add a monitor to view reliability analytics</h2>
      <p className="mt-1 text-sm text-muted-foreground">Analytics becomes available after a monitor has recorded checks.</p>
      <Link className="mt-3 inline-flex text-sm font-medium text-primary underline underline-offset-4" href="/monitoring">Go to monitoring</Link>
    </section>
  );
}

function ExclusionPicker({
  label,
  options,
  selected,
  caseInsensitive = false,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string; detail?: string }>;
  selected: string[];
  caseInsensitive?: boolean;
  onChange: (value: string, excluded: boolean) => void;
}) {
  const limitReached = selected.length >= MAX_EXCLUSIONS_PER_GROUP;
  return (
    <details className="group relative">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span>Exclude {label.toLocaleLowerCase()}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{selected.length || "None"}</span>
      </summary>
      <div className="mt-1 border bg-background p-2 sm:absolute sm:right-0 sm:z-20 sm:w-80">
        <fieldset>
          <legend className="sr-only">{`Exclude ${label.toLocaleLowerCase()} from analytics`}</legend>
          <div className="max-h-56 divide-y overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">No {label.toLocaleLowerCase()} available.</p>
            ) : options.map((option) => {
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
          {limitReached ? <p className="border-t px-2 pt-2 text-xs text-muted-foreground">Maximum {MAX_EXCLUSIONS_PER_GROUP} selections reached.</p> : null}
        </fieldset>
      </div>
    </details>
  );
}

function AnalyticsReport({ report, filters, refreshing }: { report: GeneratedReport; filters: AnalyticsFilters; refreshing: boolean }) {
  const hasChecks = report.summary.hasCompletedChecks;
  const exclusionCount = countExclusions(filters);
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Reliability over time</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {report.monitorName ?? "All monitors"} · {report.periodLabel} · {report.timeZone}
            {exclusionCount > 0 ? ` · ${formatExclusionSummary(filters)}` : ""}
          </p>
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {refreshing ? "Refreshing data…" : `Updated ${new Date(report.generatedAt).toLocaleString()}`}
        </p>
      </header>

      <SummaryStrip report={report} />

      {!hasChecks ? (
        <section className="border-y py-8">
          <h3 className="text-base font-medium">No completed checks in this period</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {exclusionCount > 0 ? "The current exclusions removed every completed check. Clear an exclusion or widen the period." : "Try a longer period or select another monitor."}
          </p>
        </section>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <FailureChart data={report.dailyMetrics} />
            <LatencyChart data={report.dailyMetrics} />
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

function SummaryStrip({ report }: { report: GeneratedReport }) {
  const metrics = [
    { label: "Uptime", value: formatReportUptime(report.summary), detail: `${report.summary.upChecks.toLocaleString()} successful checks`, tone: "text-emerald-500" },
    { label: "Failed checks", value: report.summary.failureEvents.toLocaleString(), detail: `${formatReportFailureRate(report.summary)} of completed checks`, tone: report.summary.failureEvents > 0 ? "text-rose-500" : "text-emerald-500" },
    {
      label: "P95 latency",
      value: formatReportP95Latency(report.summary),
      detail: report.summary.hasLatencySamples
        ? `${report.summary.averageLatencyMs.toLocaleString()}ms average`
        : "No latency samples",
      tone: report.summary.hasLatencySamples ? "text-amber-500" : "text-foreground",
    },
    { label: "Impacted monitors", value: report.summary.impactedMonitors.toLocaleString(), detail: `${report.summary.monitorCount.toLocaleString()} in scope · ${report.summary.currentlyPaused.toLocaleString()} paused now`, tone: report.summary.impactedMonitors > 0 ? "text-rose-500" : "text-foreground" },
  ];
  return (
    <dl className="grid border-y sm:grid-cols-2 xl:grid-cols-4 xl:divide-x">
      {metrics.map((metric) => (
        <div key={metric.label} className="border-b px-3 py-3 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0">
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
    <section className="border-y py-4">
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
    <section className="border-y py-4">
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
          <ol className="divide-y">
            {segments.map((segment, index) => (
              <li key={segment.id} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 py-2 text-sm">
                <span className={cn("size-2", FAILURE_SEGMENT_TONES[index].swatch)} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate" title={segment.label}>{segment.label}</span>
                  {segment.detail ? <span className="block truncate text-xs text-muted-foreground" title={segment.detail}>{segment.detail}</span> : null}
                </span>
                <span className="tabular-nums text-muted-foreground">{segment.failures.toLocaleString()} · {((segment.failures / total) * 100).toFixed(1)}%</span>
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
    <section className="border-y py-4">
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
    <section className="border-y py-4">
      <h3 className="text-base font-medium">HTTP response mix</h3>
      <p className="mt-1 text-sm text-muted-foreground">Most common recorded response codes.</p>
      <div className="mt-4 divide-y">
        {codes.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No HTTP status codes in this period.</p> : codes.map((item) => (
          <div key={item.statusCode} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 py-3">
            <span className="text-sm font-medium tabular-nums">HTTP {item.statusCode}</span>
            <div className="h-2 bg-muted" aria-hidden="true"><div className="h-full min-w-px bg-sky-500" style={{ width: `${(item.count / max) * 100}%` }} /></div>
            <span className="text-xs tabular-nums text-muted-foreground">{item.count.toLocaleString()}</span>
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
    <section className="border-y py-4">
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
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr><th className="py-2 pr-4 font-medium">Monitor</th><th className="px-3 py-2 text-right font-medium">Failures</th><th className="px-3 py-2 text-right font-medium">Uptime</th><th className="px-3 py-2 text-right font-medium">Average</th><th className="py-2 pl-3 text-right font-medium">P95</th></tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((monitor) => (
              <tr key={monitor.monitorId}>
                <td className="max-w-[330px] py-3 pr-4"><p className="truncate font-medium" title={monitor.name}>{monitor.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground" title={monitor.url}>{monitor.url}</p></td>
                <td className={cn("px-3 py-3 text-right tabular-nums", monitor.failures > 0 && "text-rose-500")}>{monitor.failures.toLocaleString()}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatMonitorUptime(monitor)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatMonitorAverageLatency(monitor)}</td>
                <td className="py-3 pl-3 text-right tabular-nums">{formatMonitorP95Latency(monitor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 divide-y sm:hidden">
        {rows.map((monitor) => (
          <div key={monitor.monitorId} className="py-3">
            <p className="truncate text-sm font-medium" title={monitor.name}>{monitor.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={monitor.url}>{monitor.url}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <MobileMetric label="Failures" value={monitor.failures.toLocaleString()} tone={monitor.failures > 0 ? "text-rose-500" : undefined} />
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

function appendAnalyticsExclusions(params: URLSearchParams, filters: AnalyticsFilters) {
  for (const monitorId of filters.excludeMonitorIds) params.append("excludeMonitorIds", monitorId);
  for (const tag of filters.excludeTags) params.append("excludeTags", tag);
  for (const companyId of filters.excludeCompanyIds) params.append("excludeCompanyIds", companyId);
}

async function requestAnalyticsReport(filters: AnalyticsFilters) {
  const analyticsParams = new URLSearchParams();
  for (const [key, value] of Object.entries(buildPeriodPayload(filters))) {
    if (value) analyticsParams.set(key, value);
  }
  if (filters.monitorId !== "all") analyticsParams.set("monitorId", filters.monitorId);
  appendAnalyticsExclusions(analyticsParams, filters);
  const response = await fetch(`/api/reports/analytics?${analyticsParams}`, { cache: "no-store" });
  const data = (await response.json()) as { report?: GeneratedReport; message?: string };
  return { response, data };
}

export function shouldRetryAnalyticsWithoutMonitor(status: number, monitorId: string) {
  return status === 404 && monitorId !== "all";
}

export function reconcileFiltersWithCatalog(
  filters: AnalyticsFilters,
  monitors: MonitorOption[],
  companies: CompanyOption[]
): AnalyticsFilters {
  const monitorIds = new Set(monitors.map((monitor) => monitor.id));
  const companyIds = new Set(companies.map((company) => company.id));
  const tags = new Set(monitors.flatMap((monitor) => monitor.tags).map((tag) => tag.toLowerCase()));
  const reconciledFilters = {
    ...filters,
    monitorId: filters.monitorId === "all" || monitorIds.has(filters.monitorId) ? filters.monitorId : "all",
    excludeMonitorIds: filters.excludeMonitorIds.filter((id) => monitorIds.has(id)),
    excludeTags: dedupeCaseInsensitive(filters.excludeTags.filter((tag) => tags.has(tag.toLowerCase()))),
    excludeCompanyIds: filters.excludeCompanyIds.filter((id) => companyIds.has(id)),
  };
  const selectedMonitor = monitors.find((monitor) => monitor.id === reconciledFilters.monitorId);
  return {
    ...reconciledFilters,
    monitorId: selectedMonitor && isMonitorExcludedByFilters(selectedMonitor, reconciledFilters)
      ? "all"
      : reconciledFilters.monitorId,
  };
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
