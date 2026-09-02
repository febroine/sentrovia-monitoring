import type { GeneratedReport } from "@/lib/reports/types";
import { escapeHtml } from "@/lib/html";
import { buildReportSnapshotRows } from "@/lib/reports/presentation";
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
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    -webkit-locale: "en";
  }
  main { max-width: 1120px; margin: 0 auto; padding: 36px 28px 48px; }
  .report-shell { display: grid; gap: 22px; }
  .hero {
    border: 1px solid var(--line);
    border-radius: 18px;
    background: linear-gradient(135deg, #0f172a 0%, #172554 58%, #1e3a8a 100%);
    color: #fff;
    padding: 28px;
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
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .stat {
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--surface);
    padding: 16px;
    min-height: 104px;
  }
  .stat.emphasis { border-color: #93c5fd; background: #eff6ff; }
  .stat-label { color: var(--muted); font-size: 12px; font-weight: 700; }
  .stat-value { margin-top: 8px; font-size: 26px; line-height: 1.1; font-weight: 750; }
  .stat-note { margin-top: 6px; color: var(--muted); font-size: 12px; line-height: 1.45; }
  .panel {
    border: 1px solid var(--line);
    border-radius: 18px;
    background: var(--surface);
    overflow: hidden;
  }
  .panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    border-bottom: 1px solid var(--line);
    background: var(--surface-soft);
    padding: 18px 20px;
  }
  .panel-title { margin: 0; font-size: 17px; font-weight: 750; }
  .panel-note { margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
  .panel-body { padding: 18px 20px; }
  .recommendations {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .recommendations li {
    border: 1px solid #bfdbfe;
    border-radius: 14px;
    background: #eff6ff;
    color: #1e3a8a;
    padding: 13px 14px;
    font-size: 13px;
    line-height: 1.55;
  }
  .grid-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid var(--line); padding: 12px 10px; text-align: left; vertical-align: top; }
  th { color: var(--muted); font-size: 12px; font-weight: 750; }
  td { color: #334155; font-size: 13px; line-height: 1.5; }
  tr:last-child td { border-bottom: 0; }
  .url { color: #0f172a; font-weight: 650; overflow-wrap: anywhere; }
  .muted { color: var(--muted); }
  .status { display: inline-block; border-radius: 999px; padding: 4px 9px; font-size: 11px; font-weight: 700; }
  .status-up { background: #dcfce7; color: #166534; }
  .status-down { background: #fee2e2; color: #991b1b; }
  .status-pending { background: #fef3c7; color: #92400e; }
  .empty-state {
    border: 1px dashed var(--line);
    border-radius: 12px;
    background: var(--surface-soft);
    color: var(--muted);
    padding: 14px;
    font-size: 13px;
  }
  .report-footer { color: var(--muted); font-size: 12px; line-height: 1.5; text-align: right; }
  @media (max-width: 820px) {
    main { padding: 18px 12px 28px; }
    .stats, .grid-two, .recommendations { grid-template-columns: 1fr; }
    .panel-header { display: block; }
    .hero-top { display: block; }
    .period-chip { display: inline-block; margin-top: 14px; }
    table { display: block; overflow-x: auto; white-space: nowrap; }
  }
  @media print {
    body { background: #fff; }
    main { padding: 12px; max-width: none; }
    .panel, .stat, .hero { break-inside: avoid; }
  }
`;

export function buildPrintableReportHtml(
  report: GeneratedReport,
  options: { autoPrint?: boolean } = {}
) {
  const breakdownRows = report.monitorBreakdown.map(renderMonitorBreakdownRow).join("");
  const recentFailureRows = buildRecentFailureRows(report).map(renderRecentFailureRow).join("");
  const slowMonitorRows = buildSlowMonitorRows(report).map(renderTwoColumnRow).join("");
  const failingMonitorRows = buildFailingMonitorRows(report).map(renderThreeColumnRow).join("");
  const snapshotRows = buildReportSnapshotRows(report).map(renderSnapshotRow).join("");

  return [
    renderPrintableDocumentStart(report, options.autoPrint === true),
    renderPrintableHero(report),
    renderPrintableStats(report),
    renderReportTablePanel("Service snapshot", "The key context for reading this report.", ["Item", "Detail"], snapshotRows),
    renderPrintableRecommendations(report),
    renderPrintableWatchlists(failingMonitorRows, slowMonitorRows),
    renderReportTablePanel("Failure details", "Recent failures with readable network context.", ["URL", "Code", "Time", "Detail"], recentFailureRows),
    renderReportTablePanel(
      "URL breakdown",
      "Ranked by failures first, then latency.",
      ["URL", "Company", "Status", "Code", "Uptime", "Avg latency", "P95", "Failures", "Last failure"],
      breakdownRows
    ),
    `<div class="report-footer">${escapeHtml(report.workspaceName)} &middot; ${escapeHtml(report.periodLabel)} &middot; HTML report</div>`,
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
  const startedAt = new Date(report.periodStartedAt).toLocaleString("en-GB", { timeZone: report.timeZone });
  const endedAt = new Date(report.periodEndedAt).toLocaleString("en-GB", { timeZone: report.timeZone });
  const generatedAt = new Date(report.generatedAt).toLocaleString("en-GB", { timeZone: report.timeZone });
  return `
    <section class="hero">
      <div class="hero-top">
        <div class="report-type">${escapeHtml(report.workspaceName)} / ${escapeHtml(report.templateLabel)}</div>
        <span class="period-chip">${escapeHtml(report.periodLabel)}</span>
      </div>
      <h1>${escapeHtml(report.title)}</h1>
      <p class="summary">${escapeHtml(scope)} &middot; ${escapeHtml(startedAt)} - ${escapeHtml(endedAt)} (${escapeHtml(report.timeZone)}) &middot; Generated ${escapeHtml(generatedAt)}</p>
    </section>`;
}

function renderPrintableStats(report: GeneratedReport) {
  const summary = report.summary;
  const stats = [
    ["Health", formatReportHealthScore(summary), summary.healthStatus, true],
    ["URLs tracked", String(summary.monitorCount), `${summary.currentlyDown} down now`, false],
    ["Uptime", formatReportUptime(summary), summary.hasCompletedChecks ? "Availability for this period" : "No completed checks in this period", false],
    ["P95 latency", formatReportP95Latency(summary), summary.hasLatencySamples ? `${formatReportAverageLatency(summary)} average` : "No latency samples in this period", false],
    ["Failure events", String(summary.failureEvents), `${summary.impactedMonitors} impacted URLs`, false],
    ["Failure rate", formatReportFailureRate(summary), summary.hasCompletedChecks ? "Share of completed checks that were down" : "No completed checks in this period", false],
    ["Up now", String(summary.currentlyUp), "Currently healthy URLs", false],
    ["Pending now", String(summary.currentlyPending), "Awaiting confirmation", false],
  ] as const;
  return `<section class="stats">${stats.map(renderPrintableStat).join("")}</section>`;
}

function renderPrintableStat([label, value, note, emphasis]: readonly [string, string, string, boolean]) {
  return `
    <article class="stat${emphasis ? " emphasis" : ""}">
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

function renderMonitorBreakdownRow(monitor: GeneratedReport["monitorBreakdown"][number]) {
  const statusClass = monitor.status === "up" ? "status-up" : monitor.status === "down" ? "status-down" : "status-pending";

  return `
    <tr>
      <td><div class="url">${escapeHtml(reportValue(monitor.url))}</div>${monitor.lastErrorMessage ? `<div class="muted">${escapeHtml(monitor.lastErrorMessage)}</div>` : ""}</td>
      <td>${escapeHtml(reportValue(monitor.companyName))}</td>
      <td><span class="status ${statusClass}">${escapeHtml(reportValue(monitor.status))}</span></td>
      <td>${escapeHtml(reportValue(monitor.currentStatusCode))}</td>
      <td>${escapeHtml(formatMonitorUptime(monitor))}</td>
      <td>${escapeHtml(formatMonitorAverageLatency(monitor))}</td>
      <td>${escapeHtml(formatMonitorP95Latency(monitor))}</td>
      <td>${escapeHtml(String(monitor.failures))}</td>
      <td>${escapeHtml(monitor.lastFailureAt ? new Date(monitor.lastFailureAt).toLocaleString() : EMPTY_REPORT_VALUE)}</td>
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

function renderSnapshotRow([label, detail]: string[]) {
  return `
    <tr>
      <td><strong>${escapeHtml(label)}</strong></td>
      <td>${escapeHtml(detail)}</td>
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
    monitor.lastFailureAt ? new Date(monitor.lastFailureAt).toLocaleString() : EMPTY_REPORT_VALUE,
  ]);
}

function buildRecentFailureRows(report: GeneratedReport) {
  if (report.recentFailures.length === 0) {
    return [["No data", EMPTY_REPORT_VALUE, EMPTY_REPORT_VALUE, "No failure events in this period."]];
  }

  return report.recentFailures.map((event) => [
    event.url,
    reportValue(event.statusCode),
    new Date(event.createdAt).toLocaleString(),
    event.detail,
  ]);
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
