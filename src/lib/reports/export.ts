import type { GeneratedReport } from "@/lib/reports/types";

const EMPTY_REPORT_VALUE = "--";

export function buildReportFileSlug(report: GeneratedReport) {
  const generatedDate = report.generatedAt.slice(0, 10);
  return slugify(`${report.title} ${generatedDate}`);
}

export function buildPrintableReportHtml(
  report: GeneratedReport,
  options: { autoPrint?: boolean } = {}
) {
  const breakdownRows = report.monitorBreakdown.map(renderMonitorBreakdownRow).join("");
  const recentFailureRows = buildRecentFailureRows(report).map(renderRecentFailureRow).join("");
  const slowMonitorRows = buildSlowMonitorRows(report).map(renderTwoColumnRow).join("");
  const failingMonitorRows = buildFailingMonitorRows(report).map(renderThreeColumnRow).join("");
  const snapshotRows = buildServiceSnapshotRows(report).map(renderSnapshotRow).join("");
  const autoPrintScript = options.autoPrint
    ? `
        <script>
          window.addEventListener("load", () => {
            window.setTimeout(() => window.print(), 150);
          });
        </script>
      `
    : "";

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(report.title)}</title>
        <style>
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
          @media (max-width: 820px) {
            main { padding: 18px 12px 28px; }
            .stats, .grid-two, .recommendations { grid-template-columns: 1fr; }
            .panel-header { display: block; }
            table { display: block; overflow-x: auto; white-space: nowrap; }
          }
          @media print {
            body { background: #fff; }
            main { padding: 12px; max-width: none; }
            .panel, .stat, .hero { break-inside: avoid; }
          }
        </style>
        ${autoPrintScript}
      </head>
      <body>
        <main>
          <div class="report-shell">
            <section class="hero">
              <div class="report-type">${escapeHtml(report.templateLabel)}</div>
              <h1>${escapeHtml(report.title)}</h1>
              <p class="summary">${escapeHtml(report.workspaceName)} &middot; ${escapeHtml(report.periodLabel)} &middot; Generated ${escapeHtml(
                new Date(report.generatedAt).toLocaleString()
              )}</p>
            </section>

            <section class="stats">
              <article class="stat emphasis"><div class="stat-label">Health</div><div class="stat-value">${report.summary.healthScore}/100</div><div class="stat-note">${escapeHtml(report.summary.healthStatus)}</div></article>
              <article class="stat"><div class="stat-label">URLs tracked</div><div class="stat-value">${report.summary.monitorCount}</div><div class="stat-note">${report.summary.currentlyDown} down now</div></article>
              <article class="stat"><div class="stat-label">Uptime</div><div class="stat-value">${report.summary.uptimePct.toFixed(2)}%</div><div class="stat-note">Availability for this period</div></article>
              <article class="stat"><div class="stat-label">P95 latency</div><div class="stat-value">${report.summary.p95LatencyMs}ms</div><div class="stat-note">${report.summary.averageLatencyMs}ms average</div></article>
              <article class="stat"><div class="stat-label">Failures</div><div class="stat-value">${report.summary.failureEvents}</div><div class="stat-note">${report.summary.impactedMonitors} impacted URLs</div></article>
              <article class="stat"><div class="stat-label">Failure rate</div><div class="stat-value">${report.summary.failureRatePct.toFixed(2)}%</div><div class="stat-note">Share of unavailable results</div></article>
              <article class="stat"><div class="stat-label">Up now</div><div class="stat-value">${report.summary.currentlyUp}</div><div class="stat-note">Currently healthy URLs</div></article>
              <article class="stat"><div class="stat-label">Pending now</div><div class="stat-value">${report.summary.currentlyPending}</div><div class="stat-note">Awaiting confirmation</div></article>
            </section>

            <section class="panel">
              <div class="panel-header">
                <div>
                  <h2 class="panel-title">Service snapshot</h2>
                  <p class="panel-note">The key context for reading this report.</p>
                </div>
              </div>
              <div class="panel-body">
                <table>
                  <thead><tr><th>Item</th><th>Detail</th></tr></thead>
                  <tbody>${snapshotRows}</tbody>
                </table>
              </div>
            </section>

            <section class="panel">
              <div class="panel-header">
                <div>
                  <h2 class="panel-title">What needs attention</h2>
                  <p class="panel-note">Practical items to review from this period.</p>
                </div>
              </div>
              <div class="panel-body">
                <ul class="recommendations">
                  ${report.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
                </ul>
              </div>
            </section>

            <section class="grid-two">
              <article class="panel">
                <div class="panel-header">
                  <div>
                    <h2 class="panel-title">Top failing URLs</h2>
                    <p class="panel-note">The URLs that failed most often in this period.</p>
                  </div>
                </div>
                <div class="panel-body">
                  <table>
                    <thead><tr><th>URL</th><th>Failures</th><th>Last failure</th></tr></thead>
                    <tbody>${failingMonitorRows}</tbody>
                  </table>
                </div>
              </article>

              <article class="panel">
                <div class="panel-header">
                  <div>
                    <h2 class="panel-title">Latency watchlist</h2>
                    <p class="panel-note">The slowest URLs by average response time.</p>
                  </div>
                </div>
                <div class="panel-body">
                  <table>
                    <thead><tr><th>URL</th><th>Average latency</th></tr></thead>
                    <tbody>${slowMonitorRows}</tbody>
                  </table>
                </div>
              </article>
            </section>

            <section class="panel">
              <div class="panel-header">
                <div>
                  <h2 class="panel-title">Failure details</h2>
                  <p class="panel-note">Recent failures with readable network context.</p>
                </div>
              </div>
              <div class="panel-body">
                <table>
                  <thead><tr><th>URL</th><th>Code</th><th>Time</th><th>Detail</th></tr></thead>
                  <tbody>${recentFailureRows}</tbody>
                </table>
              </div>
            </section>

            <section class="panel">
              <div class="panel-header">
                <div>
                  <h2 class="panel-title">URL breakdown</h2>
                  <p class="panel-note">Ranked by failures first, then latency.</p>
                </div>
              </div>
              <div class="panel-body">
                <table>
                  <thead><tr><th>URL</th><th>Company</th><th>Status</th><th>Code</th><th>Uptime</th><th>Avg latency</th><th>P95</th><th>Failures</th><th>Last failure</th></tr></thead>
                  <tbody>${breakdownRows}</tbody>
                </table>
              </div>
            </section>
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
      <td>${escapeHtml(`${monitor.uptimePct.toFixed(2)}%`)}</td>
      <td>${escapeHtml(`${monitor.averageLatencyMs}ms`)}</td>
      <td>${escapeHtml(`${monitor.p95LatencyMs}ms`)}</td>
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

function buildServiceSnapshotRows(report: GeneratedReport) {
  const generatedAt = new Date(report.generatedAt).toLocaleString();
  const scopeLabel = report.scope === "company" ? report.companyName ?? "Company" : "Workspace";
  const topFailingUrl = report.failingMonitors[0]?.url ?? "No failing URL in this period";
  const slowestUrl = report.slowMonitors[0]
    ? `${report.slowMonitors[0].url} (${report.slowMonitors[0].averageLatencyMs}ms avg)`
    : "No latency data in this period";

  return [
    ["Reporting window", report.periodLabel],
    ["Generated", generatedAt],
    ["Scope", scopeLabel],
    [
      "Current state",
      `${report.summary.currentlyUp} up, ${report.summary.currentlyDown} down, ${report.summary.currentlyPending} pending`,
    ],
    ["Most affected URL", topFailingUrl],
    ["Slowest URL", slowestUrl],
  ];
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
