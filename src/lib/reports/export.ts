import type { GeneratedReport } from "@/lib/reports/types";
import { escapeHtml } from "@/lib/html";
import { formatReportComparison } from "@/lib/reports/comparison";
import { formatReportCheckCoverage } from "@/lib/monitors/check-coverage";
import { buildReportSnapshotRows } from "@/lib/reports/presentation";
import { AVAILABILITY_REFERENCE_PCT, getExecutiveInsights, getMonitorRiskPoints } from "@/lib/reports/analytics-insights";
import {
  formatMonitorAverageLatency,
  formatMonitorP95Latency,
  formatMonitorUptime,
  formatReportFailureRate,
  formatReportP95Latency,
  formatReportUptime,
} from "@/lib/reports/metrics";

const EMPTY_REPORT_VALUE = "--";

export function buildReportFileSlug(report: GeneratedReport) {
  const generatedDate = report.generatedAt.slice(0, 10);
  return slugify(`${report.title} ${generatedDate}`);
}

const PRINTABLE_REPORT_STYLES = `
  :root {
    color-scheme: light;
    --bg: #f6f8fb;
    --surface: #ffffff;
    --surface-soft: #f8fafc;
    --ink: #111827;
    --muted: #64748b;
    --line: #dbe3ef;
    --accent: #2563eb;
    --good: #059669;
    --warn: #d97706;
    --bad: #dc2626;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-locale: "en";
  }
  main { max-width: 1120px; margin: 0 auto; padding: 36px 28px 48px; }
  .report-shell { display: grid; grid-template-columns: minmax(0, 1fr); gap: 26px; }
  .hero {
    background: #0f172a;
    color: #fff;
    padding: 22px;
  }
  .hero-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .period-chip {
    border: 1px solid #3b82f6;
    border-radius: 999px;
    color: #bfdbfe;
    padding: 5px 9px;
    font-size: 11px;
    font-weight: 750;
    white-space: nowrap;
  }
  .report-type, .stat-label, th {
    -webkit-locale: "en";
    font-feature-settings: "locl" 0;
    letter-spacing: 0;
  }
  .report-type { color: #bfdbfe; font-size: 13px; font-weight: 700; }
  h1 { margin: 10px 0 0; font-size: 30px; line-height: 1.12; letter-spacing: 0; }
  .summary { margin: 12px 0 0; color: #dbeafe; font-size: 14px; line-height: 1.6; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }
  .stat {
    padding: 0;
  }
  .stat-label { color: var(--muted); font-size: 12px; font-weight: 700; }
  .stat-value { margin-top: 8px; font-size: 26px; line-height: 1.1; font-weight: 750; }
  .stat-note { margin-top: 6px; color: var(--muted); font-size: 12px; line-height: 1.45; }
  .panel {
    min-width: 0;
  }
  .panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    padding: 0;
  }
  .panel-title { margin: 0; font-size: 17px; font-weight: 750; }
  .panel-note { margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
  .panel-body { padding: 12px 0 0; overflow-x: auto; }
  .recommendations {
    margin: 0;
    padding-left: 18px;
  }
  .recommendations li {
    color: var(--ink);
    padding: 0 0 8px;
    font-size: 13px;
    line-height: 1.55;
  }
  .recommendations li:last-child { padding-bottom: 0; }
  .grid-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; min-width: 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 10px; text-align: left; vertical-align: top; }
  th { border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; font-weight: 750; }
  td { color: #334155; font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
  tbody tr:nth-child(even) { background: var(--surface-soft); }
  .url { color: #0f172a; font-weight: 650; overflow-wrap: anywhere; }
  .muted { color: var(--muted); }
  .status { display: inline-block; border-radius: 999px; padding: 4px 9px; font-size: 11px; font-weight: 700; }
  .status-up { background: #dcfce7; color: #166534; }
  .status-down { background: #fee2e2; color: #991b1b; }
  .status-pending { background: #fef3c7; color: #92400e; }
  .empty-state {
    color: var(--muted);
    font-size: 13px;
  }
  .report-footer { color: var(--muted); font-size: 12px; line-height: 1.5; text-align: right; }
  .brief { padding: 0; }
  .brief h2 { font-size: 17px; margin: 0 0 12px; }
  .brief-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
  .brief-item { min-width: 0; }
  .brief-item dt { color: var(--muted); font-size: 12px; }
  .brief-item dd { margin: 5px 0 0; font-size: 21px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .brief-item p { color: var(--muted); font-size: 12px; margin: 5px 0 0; overflow-wrap: anywhere; }
  .chart-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
  .chart-panel { min-width: 0; break-inside: avoid; }
  .chart-panel h2 { margin: 0; font-size: 17px; }
  .chart-panel p { color: var(--muted); font-size: 12px; line-height: 1.45; }
  .chart-panel svg { width: 100%; height: auto; display: block; }
  .chart-panel .tick { fill: var(--muted); font: 10px "IBM Plex Sans", sans-serif; }
  .chart-panel .axis { stroke: var(--line); }
  .snapshot-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 24px; margin: 14px 0 0; }
  .snapshot-item { min-width: 0; }
  .snapshot-item dt { color: var(--muted); font-size: 12px; }
  .snapshot-item dd { margin: 4px 0 0; color: var(--ink); font-size: 13px; line-height: 1.45; overflow-wrap: anywhere; }
  @media (max-width: 820px) {
    main { padding: 18px 12px 28px; }
    .stats, .grid-two, .brief-grid, .chart-pair { grid-template-columns: 1fr; }
    .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .snapshot-grid { grid-template-columns: 1fr; }
    .panel-header { display: block; }
    .hero-top { display: block; }
    .period-chip { display: inline-block; margin-top: 14px; }
    table { display: block; overflow-x: auto; white-space: nowrap; }
  }
  @media print {
    body { background: #fff; }
    main { padding: 12px; max-width: none; }
    .stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .brief-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .grid-two, .chart-pair { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .snapshot-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .panel-body { overflow: visible; }
    table { display: table; overflow: visible; white-space: normal; table-layout: fixed; }
    th, td { padding: 7px 4px; font-size: 10px; }
    .panel-header { display: flex; }
    .hero-top { display: flex; }
    .period-chip { margin-top: 0; }
    .panel-header, .hero, .brief, .chart-panel, .snapshot-panel { break-inside: avoid; }
    .panel-header { break-after: avoid-page; }
    thead { display: table-header-group; break-after: avoid-page; }
    tr { break-inside: avoid; }
    .report-footer { break-before: avoid; }
  }
`;

export function buildPrintableReportHtml(
  report: GeneratedReport,
  options: { autoPrint?: boolean; output?: "html" | "pdf" } = {}
) {
  const breakdownRows = report.monitorBreakdown
    .map((monitor) => renderMonitorBreakdownRow(monitor, report.timeZone))
    .join("");
  const recentFailureRows = buildRecentFailureRows(report).map(renderRecentFailureRow).join("");
  const slowMonitorRows = buildSlowMonitorRows(report).map(renderTwoColumnRow).join("");
  const failingMonitorRows = buildFailingMonitorRows(report).map(renderThreeColumnRow).join("");
  const snapshotRows = buildReportSnapshotRows(report);

  return [
    renderPrintableDocumentStart(report, options.autoPrint === true),
    renderPrintableHero(report),
    renderPrintableStats(report),
    renderPrintableComparison(report),
    renderExecutiveBrief(report),
    renderTrendCharts(report),
    renderPrintableSnapshot(snapshotRows),
    renderPrintableRecommendations(report),
    renderPrintableWatchlists(failingMonitorRows, slowMonitorRows),
    renderReportTablePanel("Failure details", "Recent failures with readable network context.", ["URL", "Code", "Time", "Detail"], recentFailureRows),
    renderReportTablePanel(
      "URL breakdown",
      "Ranked by failures first, then latency.",
      ["URL", "Company", "Status", "Code", "Uptime", "Avg latency", "P95", "Failures", "Last failure"],
      breakdownRows
    ),
    `<div class="report-footer">${escapeHtml(report.workspaceName)} &middot; ${escapeHtml(report.periodLabel)} &middot; ${options.output === "pdf" ? "PDF" : "HTML"} report</div>`,
    renderPrintableDocumentEnd(),
  ].join("");
}

function renderPrintableDocumentStart(report: GeneratedReport, autoPrint: boolean) {
  const autoPrintScript = autoPrint
    ? `<script>window.addEventListener("load",()=>{window.setTimeout(()=>window.print(),150);});</script>`
    : "";
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(report.title)}</title>
        <style>${PRINTABLE_REPORT_STYLES}</style>
        ${autoPrintScript}
      </head>
      <body>
        <main>
          <div class="report-shell">`;
}

function renderPrintableHero(report: GeneratedReport) {
  const scope = report.scope === "company" ? report.companyName ?? "Company" : "Workspace";
  const startedAt = formatReportDateTime(report.periodStartedAt, report.timeZone);
  const endedAt = formatReportDateTime(report.periodEndedAt, report.timeZone);
  const generatedAt = formatReportDateTime(report.generatedAt, report.timeZone);
  return `
    <section class="hero">
      <div class="hero-top">
        <div class="report-type">${escapeHtml(report.workspaceName)} / ${escapeHtml(report.templateLabel)}</div>
        <span class="period-chip">${escapeHtml(report.periodLabel)}</span>
      </div>
      <h1>${escapeHtml(report.title)}</h1>
      <p class="summary">${escapeHtml(scope)} &middot; ${report.summary.monitorCount} monitors &middot; ${escapeHtml(startedAt)} - ${escapeHtml(endedAt)} (${escapeHtml(report.timeZone)}) &middot; Generated ${escapeHtml(generatedAt)}</p>
    </section>`;
}

function renderPrintableStats(report: GeneratedReport) {
  const summary = report.summary;
  const stats = [
    ["Uptime", formatReportUptime(summary), summary.hasCompletedChecks ? "Completed checks in this period" : "No completed checks in this period"],
    ["Down now", String(summary.currentlyDown), `${summary.monitorCount} monitors in scope`],
    ["Failed checks", String(summary.failureEvents), `${formatReportFailureRate(summary)} of completed checks`],
    ["P95 latency", formatReportP95Latency(summary), summary.hasLatencySamples ? "Tail response time" : "No latency samples in this period"],
  ] as const;
  return `<section class="stats">${stats.map(renderPrintableStat).join("")}</section>`;
}

function renderPrintableComparison(report: GeneratedReport) {
  if (!report.comparison) return "";
  const comparison = report.comparison;
  const values = formatReportComparison(comparison);
  const coverage = report.checkCoverage ? formatReportCheckCoverage(report.checkCoverage) : null;
  return `<section class="brief"><h2>Compared with previous period</h2>
    <p class="muted">${escapeHtml(formatReportDateTime(comparison.previousPeriodStartedAt, report.timeZone))} - ${escapeHtml(formatReportDateTime(comparison.previousPeriodEndedAt, report.timeZone))} · ${comparison.previousCompletedChecks} completed checks in the same monitor scope</p>
    <dl class="brief-grid">
      <div class="brief-item"><dt>Uptime change</dt><dd>${escapeHtml(values.uptime)}</dd></div>
      <div class="brief-item"><dt>P95 latency change</dt><dd>${escapeHtml(values.latency)}</dd></div>
      <div class="brief-item"><dt>${escapeHtml(values.referenceLabel)} reference budget</dt><dd>${escapeHtml(values.budget)}</dd><p>${escapeHtml(values.budgetDetail)}</p></div>
    </dl>
    ${coverage ? `<p class="muted">Current period check coverage: ${escapeHtml(coverage.value)} · ${escapeHtml(coverage.detail)}</p>` : ""}
  </section>`;
}

function renderExecutiveBrief(report: GeneratedReport) {
  const insights = getExecutiveInsights(report);
  const items = [
    ["Days at 99.9% reference", `${insights.daysAtReference} / ${insights.observedDays}`, "Observed days with completed checks"],
    ["Monitors below reference", String(insights.belowReference), `${insights.missingData} without completed checks`],
    ["Largest failure contributor", insights.leadingFailure ? `${insights.leadingFailure.sharePct.toFixed(1)}%` : "None", insights.leadingFailure ? `${insights.leadingFailure.name} · ${insights.leadingFailure.failures} failed checks` : "No failed checks in scope"],
  ];
  return `<section class="brief"><h2>Executive brief</h2><dl class="brief-grid">${items.map(([label, value, detail]) => `<div class="brief-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd><p>${escapeHtml(detail)}</p></div>`).join("")}</dl><p class="muted">99.9% is a reference threshold, not a configured SLA.</p></section>`;
}

function renderTrendCharts(report: GeneratedReport) {
  const observed = report.dailyMetrics.filter((day) => day.upChecks + day.downChecks > 0);
  const { monitors, medianLatencyMs } = getMonitorRiskPoints(report);
  const daily = observed.slice(-30);
  const failureMax = Math.max(1, ...daily.map((day) => day.downChecks));
  const bars = daily.map((day, index) => {
    const x = 42 + index * 640 / Math.max(1, daily.length);
    const width = Math.max(3, 640 / Math.max(1, daily.length) - 3);
    const uptimeHeight = day.uptimePct / 100 * 125;
    const failureHeight = day.downChecks / failureMax * 125;
    const label = escapeHtml(`${day.date}: ${day.uptimePct.toFixed(2)}% availability, ${day.downChecks} failed checks`);
    return {
      availability: `<rect x="${x}" y="${160 - uptimeHeight}" width="${width}" height="${uptimeHeight}" fill="${day.uptimePct < AVAILABILITY_REFERENCE_PCT ? "#dc2626" : "#059669"}"><title>${label}</title></rect>`,
      failures: `<rect x="${x}" y="${160 - failureHeight}" width="${width}" height="${failureHeight}" fill="#dc2626"><title>${label}</title></rect>`,
    };
  });
  const first = daily[0]?.date ?? "No data";
  const last = daily.at(-1)?.date ?? "";
  const axis = `<line x1="42" y1="160" x2="690" y2="160" class="axis"/><text x="42" y="184" class="tick">${escapeHtml(first)}</text><text x="690" y="184" text-anchor="end" class="tick">${escapeHtml(last)}</text>`;
  const chart = (title: string, note: string, content: string, topLabel: string) => `<section class="chart-panel"><h2>${title}</h2><p>${note}</p>${daily.length ? `<svg viewBox="0 0 720 195" role="img" aria-label="${escapeHtml(title)} from ${escapeHtml(first)} to ${escapeHtml(last)}"><text x="36" y="36" text-anchor="end" class="tick">${topLabel}</text>${axis}${content}</svg>` : `<p>No completed checks in this period.</p>`}</section>`;
  return `<div class="chart-pair">${chart("Availability trend", "Daily availability from completed checks. Red days are below the 99.9% reference.", bars.map((bar) => bar.availability).join(""), "100%")}${chart("Failed checks by day", "Daily count of confirmed failed checks.", bars.map((bar) => bar.failures).join(""), String(failureMax))}</div><p class="muted">${monitors.length} monitors have both availability and latency samples; fleet median P95: ${medianLatencyMs === null ? "No data" : `${Math.round(medianLatencyMs)}ms`}. Charts show the last ${daily.length} observed days.</p>`;
}

function renderPrintableStat([label, value, note]: readonly [string, string, string]) {
  return `
    <article class="stat">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value">${escapeHtml(value)}</div>
      <div class="stat-note">${escapeHtml(note)}</div>
    </article>`;
}

function renderPrintableRecommendations(report: GeneratedReport) {
  const items = report.recommendations.length > 0
    ? report.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : '<li class="empty-state">No immediate action items were identified in this period.</li>';
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">What needs attention</h2>
          <p class="panel-note">Practical items to review from this period.</p>
        </div>
      </div>
      <div class="panel-body"><ul class="recommendations">${items}</ul></div>
    </section>`;
}

function renderPrintableSnapshot(rows: string[][]) {
  return `<section class="panel snapshot-panel">
    <h2 class="panel-title">Service snapshot</h2>
    <p class="panel-note">The key context for reading this report.</p>
    <dl class="snapshot-grid">${rows.map(([label, detail]) => `<div class="snapshot-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(detail)}</dd></div>`).join("")}</dl>
  </section>`;
}

function renderPrintableWatchlists(failingRows: string, slowRows: string) {
  return `
    <section class="grid-two">
      ${renderReportTablePanel(
        "Top failing URLs",
        "The URLs that failed most often in this period.",
        ["URL", "Failures", "Last failure"],
        failingRows,
        "article"
      )}
      ${renderReportTablePanel(
        "Latency watchlist",
        "The slowest URLs by average response time.",
        ["URL", "Average latency"],
        slowRows,
        "article"
      )}
    </section>`;
}

function renderReportTablePanel(
  title: string,
  note: string,
  headers: string[],
  rows: string,
  element: "section" | "article" = "section"
) {
  const headerCells = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  return `
    <${element} class="panel">
      <div class="panel-header">
        <div>
          <h2 class="panel-title">${escapeHtml(title)}</h2>
          <p class="panel-note">${escapeHtml(note)}</p>
        </div>
      </div>
      <div class="panel-body">
        <table>
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </${element}>`;
}

function renderPrintableDocumentEnd() {
  return `
          </div>
        </main>
      </body>
    </html>
  `;
}

function renderMonitorBreakdownRow(
  monitor: GeneratedReport["monitorBreakdown"][number],
  timeZone: string
) {
  const statusClass = monitor.pausedUntil ? "status-pending" : monitor.status === "up" ? "status-up" : monitor.status === "down" ? "status-down" : "status-pending";
  const statusLabel = monitor.pausedUntil
    ? `paused until ${formatReportDateTime(monitor.pausedUntil, timeZone)}`
    : monitor.status;

  return `
    <tr>
      <td><div class="url">${escapeHtml(reportValue(monitor.url))}</div>${monitor.lastErrorMessage ? `<div class="muted">${escapeHtml(monitor.lastErrorMessage)}</div>` : ""}</td>
      <td>${escapeHtml(reportValue(monitor.companyName))}</td>
      <td><span class="status ${statusClass}">${escapeHtml(statusLabel)}</span></td>
      <td>${escapeHtml(reportValue(monitor.currentStatusCode))}</td>
      <td>${escapeHtml(formatMonitorUptime(monitor))}</td>
      <td>${escapeHtml(formatMonitorAverageLatency(monitor))}</td>
      <td>${escapeHtml(formatMonitorP95Latency(monitor))}</td>
      <td>${escapeHtml(String(monitor.failures))}</td>
      <td>${escapeHtml(monitor.lastFailureAt ? formatReportDateTime(monitor.lastFailureAt, timeZone) : EMPTY_REPORT_VALUE)}</td>
    </tr>
  `;
}

function renderRecentFailureRow([url, statusCode, time, detail]: string[]) {
  return `
    <tr>
      <td><div class="url">${escapeHtml(url)}</div></td>
      <td>${escapeHtml(statusCode)}</td>
      <td>${escapeHtml(time)}</td>
      <td>${escapeHtml(detail)}</td>
    </tr>
  `;
}

function renderTwoColumnRow([first, second]: string[]) {
  return `
    <tr>
      <td><div class="url">${escapeHtml(first)}</div></td>
      <td>${escapeHtml(second)}</td>
    </tr>
  `;
}

function renderThreeColumnRow([first, second, third]: string[]) {
  return `
    <tr>
      <td><div class="url">${escapeHtml(first)}</div></td>
      <td>${escapeHtml(second)}</td>
      <td>${escapeHtml(third)}</td>
    </tr>
  `;
}

function buildSlowMonitorRows(report: GeneratedReport) {
  if (report.slowMonitors.length === 0) {
    return [["No data", "0ms"]];
  }

  return report.slowMonitors.map((monitor) => [
    monitor.url,
    `${monitor.averageLatencyMs}ms`,
  ]);
}

function buildFailingMonitorRows(report: GeneratedReport) {
  if (report.failingMonitors.length === 0) {
    return [["No data", "0", EMPTY_REPORT_VALUE]];
  }

  return report.failingMonitors.map((monitor) => [
    monitor.url,
    String(monitor.failures),
    monitor.lastFailureAt ? formatReportDateTime(monitor.lastFailureAt, report.timeZone) : EMPTY_REPORT_VALUE,
  ]);
}

function buildRecentFailureRows(report: GeneratedReport) {
  if (report.recentFailures.length === 0) {
    return [["No data", EMPTY_REPORT_VALUE, EMPTY_REPORT_VALUE, "No failure events in this period."]];
  }

  return report.recentFailures.map((event) => [
    event.url,
    reportValue(event.statusCode),
    formatReportDateTime(event.createdAt, report.timeZone),
    event.detail,
  ]);
}

function formatReportDateTime(value: string, timeZone: string) {
  return new Date(value).toLocaleString("en-GB", { timeZone });
}

function reportValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return EMPTY_REPORT_VALUE;
  }

  return String(value);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
