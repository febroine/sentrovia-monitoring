import {
  Activity,
  Download,
  Gauge,
  ScanLine,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>{report.title}</CardTitle>
            <CardDescription>
              {report.periodLabel} ({report.timeZone}) / {new Date(report.periodStartedAt).toLocaleString("en-GB", { timeZone: report.timeZone })} – {new Date(report.periodEndedAt).toLocaleString("en-GB", { timeZone: report.timeZone })}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">{report.templateLabel} / {report.workspaceName}</span>
            <Button variant="outline" size="sm" onClick={onExportHtml}>
              <Download className="mr-2 h-4 w-4" /> Download HTML
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <dl className="grid border-y md:grid-cols-2 xl:grid-cols-4 xl:divide-x">
          <PreviewMetric label="Health" value={formatReportHealthScore(report.summary)} detail={report.summary.healthStatus} tone={healthScoreTone(report.summary.healthScore)} />
          <PreviewMetric label="Monitors" value={String(report.summary.monitorCount)} tone="text-sky-600 dark:text-sky-400" />
          <PreviewMetric label="Uptime" value={formatReportUptime(report.summary)} detail={report.summary.hasCompletedChecks ? undefined : "no completed checks"} tone={uptimeTone(report.summary.uptimePct, report.summary.hasCompletedChecks)} />
          <PreviewMetric label="P95 latency" value={formatReportP95Latency(report.summary)} detail={report.summary.hasLatencySamples ? `${formatReportAverageLatency(report.summary)} avg` : "no latency samples"} tone={report.summary.hasLatencySamples ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"} />
          <PreviewMetric label="Failure events" value={String(report.summary.failureEvents)} detail="confirmed down checks" tone={riskCountTone(report.summary.failureEvents)} />
          <PreviewMetric label="Impacted" value={String(report.summary.impactedMonitors)} detail="monitors with failure events" tone={riskCountTone(report.summary.impactedMonitors)} />
          <PreviewMetric label="Failure rate" value={formatReportFailureRate(report.summary)} detail={report.summary.hasCompletedChecks ? undefined : "no completed checks"} tone={failureRateTone(report.summary.failureRatePct, report.summary.hasCompletedChecks)} />
        </dl>
        <dl className="grid border-y md:grid-cols-3 md:divide-x">
          <StateChip tone="emerald" label="Up now" value={String(report.summary.currentlyUp)} />
          <StateChip tone="rose" label="Down now" value={String(report.summary.currentlyDown)} />
          <StateChip tone="amber" label="Pending now" value={String(report.summary.currentlyPending)} />
        </dl>
      </CardContent>
    </Card>
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
    <Card className="overflow-hidden border-border/70">
      <CardHeader className="border-b bg-muted/10">
        <CardTitle className="flex items-center gap-2 text-base">
          <TriangleAlert className="size-4 text-rose-600 dark:text-rose-400" /> Top failing monitors
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y pt-4">
        {report.failingMonitors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No failures during the selected period.</p>
        ) : report.failingMonitors.map((monitor) => (
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
        ))}
      </CardContent>
    </Card>
  );
}

function LatencyWatchlistCard({ report }: { report: GeneratedReport }) {
  return (
    <Card className="overflow-hidden border-border/70">
      <CardHeader className="border-b bg-muted/10">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="size-4 text-amber-600 dark:text-amber-400" /> Latency watchlist
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y pt-4">
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
      </CardContent>
    </Card>
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
                  {new Date(event.createdAt).toLocaleString()} / HTTP {event.statusCode ?? "N/A"}
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
                  Status {monitor.status} / HTTP {monitor.currentStatusCode ?? "N/A"} / {monitor.failures} failures
                </p>
                {monitor.lastErrorMessage ? <p className="mt-2 text-xs leading-5 text-destructive">{monitor.lastErrorMessage}</p> : null}
              </div>
              <MonitorBreakdownMetrics monitor={monitor} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MonitorBreakdownMetrics({ monitor }: { monitor: GeneratedReport["monitorBreakdown"][number] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>Uptime {formatMonitorUptime(monitor)}</span>
      <span>Avg latency {formatMonitorAverageLatency(monitor)}</span>
      <span>P95 {formatMonitorP95Latency(monitor)}</span>
      <span>Last checked {monitor.lastCheckedAt ? new Date(monitor.lastCheckedAt).toLocaleString() : "N/A"}</span>
    </div>
  );
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
    : "text-emerald-600 dark:text-emerald-400";
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
