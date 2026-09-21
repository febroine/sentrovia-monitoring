import { formatReportComparison } from "@/lib/reports/comparison";
import { formatReportCheckCoverage } from "@/lib/monitors/check-coverage";
import type { GeneratedReport } from "@/lib/reports/types";
import { formatPanelDateTime } from "@/lib/time";

export function ReportComparison({ report }: { report: GeneratedReport }) {
  const comparison = report.comparison;
  if (!comparison) return null;

  const values = formatReportComparison(comparison);
  const coverage = report.checkCoverage ? formatReportCheckCoverage(report.checkCoverage) : null;
  return (
    <section aria-label="Previous period and reference budget" className="border-t border-border pt-4">
      <h3 className="text-sm font-medium">Compared with previous period</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatPanelDateTime(comparison.previousPeriodStartedAt, { timeZone: report.timeZone })} – {formatPanelDateTime(comparison.previousPeriodEndedAt, { timeZone: report.timeZone })} · {comparison.previousCompletedChecks.toLocaleString("en-GB")} completed checks in the same monitor scope
      </p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Uptime change</dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">{values.uptime}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">P95 latency change</dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">{values.latency}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{values.referenceLabel} reference budget</dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">{values.budget}</dd>
          <p className="mt-1 text-xs text-muted-foreground">{values.budgetDetail}</p>
        </div>
      </dl>
      {coverage ? <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        Current period check coverage: <span className="font-medium tabular-nums text-foreground">{coverage.value}</span> · {coverage.detail}
      </p> : null}
    </section>
  );
}
