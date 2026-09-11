import {
  Activity,
  Download,
  ScanLine,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatMonitorAverageLatency,
  formatMonitorP95Latency,
  formatMonitorUptime,
  formatReportAverageLatency,
  formatReportFailureRate,
  formatReportHealthScore,
  formatReportP95Latency,
  formatReportUptime,
} from "@/lib/reports/metrics";
import type { GeneratedReport } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

export function ReportPreviewPanel({
  report,
  onExportHtml,
}: {
  report: GeneratedReport;
  onExportHtml: () => void;
}) {
  return (
    <div className="space-y-4">
      <ReportSummaryCard report={report} onExportHtml={onExportHtml} />
      <ReportFindings report={report} />
      <ReportWatchlists report={report} />
      <RecentFailures report={report} />
      <MonitorBreakdown report={report} />
    </div>
  );
}

function ReportSummaryCard({ report, onExportHtml }: { report: GeneratedReport; onExportHtml: () => void }) {
  return (
    <section className="border-y">
      <div className="border-b py-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-medium">{report.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {report.periodLabel} ({report.timeZone}) / {new Date(report.periodStartedAt).toLocaleString("en-GB", { timeZone: report.timeZone })} – {new Date(report.periodEndedAt).toLocaleString("en-GB", { timeZone: report.timeZone })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">{report.templateLabel} / {report.workspaceName}</span>
            <Button variant="outline" size="sm" onClick={onExportHtml}>
              <Download className="mr-2 h-4 w-4" /> Download HTML
            </Button>
          </div>
        </div>
      </div>
      <div className="space-y-4 py-4">
        <dl className="grid border-y md:grid-cols-2 xl:grid-cols-4 xl:divide-x">
          <PreviewMetric label="Health" value={formatReportHealthScore(report.summary)} detail={report.summary.healthStatus} tone={report.summary.hasCompletedChecks ? healthScoreTone(report.summary.healthScore) : "text-muted-foreground"} />
          <PreviewMetric label="Monitors" value={String(report.summary.monitorCount)} tone="text-muted-foreground" />
          <PreviewMetric label="Uptime" value={formatReportUptime(report.summary)} detail={report.summary.hasCompletedChecks ? undefined : "no completed checks"} tone={uptimeTone(report.summary.uptimePct, report.summary.hasCompletedChecks)} />
          <PreviewMetric label="P95 latency" value={formatReportP95Latency(report.summary)} detail={report.summary.hasLatencySamples ? `${formatReportAverageLatency(report.summary)} avg` : "no latency samples"} tone={report.summary.hasLatencySamples ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"} />
          <PreviewMetric label="Failure events" value={String(report.summary.failureEvents)} detail="confirmed down checks" tone={riskCountTone(report.summary.failureEvents)} />
          <PreviewMetric label="Impacted" value={String(report.summary.impactedMonitors)} detail="monitors with failure events" tone={riskCountTone(report.summary.impactedMonitors)} />
          <PreviewMetric label="Failure rate" value={formatReportFailureRate(report.summary)} detail={report.summary.hasCompletedChecks ? undefined : "no completed checks"} tone={failureRateTone(report.summary.failureRatePct, report.summary.hasCompletedChecks)} />
        </dl>
        <dl className="grid border-y md:grid-cols-4 md:divide-x">
          <StateChip tone="emerald" label="Up now" value={String(report.summary.currentlyUp)} />
          <StateChip tone="rose" label="Down now" value={String(report.summary.currentlyDown)} />
          <StateChip tone="amber" label="Pending now" value={String(report.summary.currentlyPending)} />
          <StateChip tone="slate" label="Paused now" value={String(report.summary.currentlyPaused)} />
        </dl>
      </div>
    </section>
  );
}

function ReportFindings({ report }: { report: GeneratedReport }) {
  return (
    <section className="border-y py-4">
      <h3 className="flex items-center gap-2 text-base font-medium">
        <ScanLine className="size-4 text-sky-600 dark:text-sky-400" /> Report findings
      </h3>
      <div className="divide-y pt-3">
        {report.recommendations.map((item, index) => (
          <div key={`${item}-${index}`} className="py-3 first:pt-0 last:pb-0">
            <p className="text-sm leading-6">{item}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReportWatchlists({ report }: { report: GeneratedReport }) {
  const maxFailureCount = Math.max(1, ...report.failingMonitors.map((monitor) => monitor.failures));
  return (
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <FailingMonitorsCard report={report} maxFailureCount={maxFailureCount} />
      <LatencyWatchlistCard report={report} />
    </div>
  );
}

function FailingMonitorsCard({ report, maxFailureCount }: { report: GeneratedReport; maxFailureCount: number }) {
  return (
    <section className="border-y py-4" aria-labelledby="failing-monitors-title">
      <h3 id="failing-monitors-title" className="text-base font-medium">Top failing monitors</h3>
      <div className="mt-3 divide-y">
        {report.failingMonitors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No failures during the selected period.</p>
        ) : report.failingMonitors.map((monitor) => (
          <div key={monitor.monitorId} className="py-4 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium [overflow-wrap:anywhere]">{monitor.url}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {monitor.lastFailureAt ? `Last failure ${formatReportDateTime(monitor.lastFailureAt, report.timeZone)}` : "No timestamp recorded"}
                </p>
              </div>
              <span className="text-xs font-medium text-muted-foreground">{monitor.failures} failures</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-rose-500" style={{ width: getFailureBarWidth(monitor.failures, maxFailureCount) }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function getFailureBarWidth(failures: number, maxFailureCount: number) {
  if (failures <= 0 || maxFailureCount <= 0) return "0%";
  return `${Math.min(100, (failures / maxFailureCount) * 100)}%`;
}

function LatencyWatchlistCard({ report }: { report: GeneratedReport }) {
  return (
    <section className="border-y py-4" aria-labelledby="latency-watchlist-title">
      <h3 id="latency-watchlist-title" className="text-base font-medium">Latency watchlist</h3>
      <div className="mt-3 divide-y">
        {report.slowMonitors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No latency samples for this period.</p>
        ) : report.slowMonitors.map((monitor) => (
          <div key={monitor.monitorId} className="py-4 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium [overflow-wrap:anywhere]">{monitor.url}</p>
              <span className="text-xs font-medium text-muted-foreground">{monitor.averageLatencyMs}ms avg</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentFailures({ report }: { report: GeneratedReport }) {
  return (
    <section className="border-y py-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-medium">
          <TriangleAlert className="size-4 text-rose-600 dark:text-rose-400" /> Recent failure events
        </h3>
        <p className="text-sm text-muted-foreground">Latest failures included in the report.</p>
      </div>
      <div className="divide-y pt-3">
        {report.recentFailures.length === 0 ? (
          <p className="text-sm text-muted-foreground">No failure events during the selected period.</p>
        ) : report.recentFailures.map((event) => (
          <div key={`${event.monitorId}-${event.createdAt}`} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-medium [overflow-wrap:anywhere]">{event.url}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {formatReportDateTime(event.createdAt, report.timeZone)} / HTTP {event.statusCode ?? "N/A"}
                </p>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{event.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MonitorBreakdown({ report }: { report: GeneratedReport }) {
  return (
    <section className="border-y py-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-medium">
          <Activity className="size-4 text-emerald-600 dark:text-emerald-400" /> Monitor breakdown
        </h3>
        <p className="text-sm text-muted-foreground">Ranked by failures, then average latency.</p>
      </div>
      <div className="divide-y pt-3">
        {report.monitorBreakdown.map((monitor) => (
          <div key={monitor.monitorId} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-medium [overflow-wrap:anywhere]">{monitor.url}</p>
                <p className="mt-1 text-xs text-muted-foreground">{monitor.companyName ?? "No company"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {monitor.pausedUntil
                    ? `Paused until ${formatReportDateTime(monitor.pausedUntil, report.timeZone)}`
                    : `Status ${monitor.status} / HTTP ${monitor.currentStatusCode ?? "N/A"}`} / {monitor.failures} failures
                </p>
                {monitor.lastErrorMessage ? <p className="mt-2 text-xs leading-5 text-destructive">{monitor.lastErrorMessage}</p> : null}
              </div>
              <MonitorBreakdownMetrics monitor={monitor} timeZone={report.timeZone} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MonitorBreakdownMetrics({
  monitor,
  timeZone,
}: {
  monitor: GeneratedReport["monitorBreakdown"][number];
  timeZone: string;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>Uptime {formatMonitorUptime(monitor)}</span>
      <span>Avg latency {formatMonitorAverageLatency(monitor)}</span>
      <span>P95 {formatMonitorP95Latency(monitor)}</span>
      <span>Last checked {monitor.lastCheckedAt ? formatReportDateTime(monitor.lastCheckedAt, timeZone) : "N/A"}</span>
    </div>
  );
}

function formatReportDateTime(value: string, timeZone: string) {
  return new Date(value).toLocaleString("en-GB", { timeZone });
}

function PreviewMetric({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: string }) {
  return (
    <div className="border-b px-4 py-3 last:border-b-0 xl:[&:nth-last-child(-n+3)]:border-b-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("mt-2 text-xl font-semibold tracking-tight", tone)}>{value}</dd>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function healthScoreTone(score: number) {
  if (score >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function uptimeTone(uptimePct: number, hasCompletedChecks: boolean) {
  if (!hasCompletedChecks) return "text-muted-foreground";
  if (uptimePct >= 99) return "text-emerald-600 dark:text-emerald-400";
  if (uptimePct >= 95) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function riskCountTone(count: number) {
  return count > 0
    ? "text-rose-600 dark:text-rose-400"
    : "text-muted-foreground";
}

function failureRateTone(rate: number, hasCompletedChecks: boolean) {
  if (!hasCompletedChecks) return "text-muted-foreground";
  if (rate === 0) return "text-emerald-600 dark:text-emerald-400";
  if (rate < 5) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function StateChip({
  tone,
  label,
  value,
}: {
  tone: "emerald" | "rose" | "amber" | "slate";
  label: string;
  value: string;
}) {
  return (
    <div className="border-b px-4 py-3 last:border-b-0 md:border-b-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("mt-2 text-lg font-semibold", value !== "0" && tone === "emerald" && "text-emerald-500", value !== "0" && tone === "rose" && "text-rose-500", value !== "0" && tone === "amber" && "text-amber-500", (value === "0" || tone === "slate") && "text-muted-foreground")}>{value}</dd>
    </div>
  );
}
