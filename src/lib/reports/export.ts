import type { GeneratedReport } from "@/lib/reports/types";

const EMPTY_REPORT_VALUE = "--";

export function buildReportFileSlug(report: GeneratedReport) {
  const generatedDate = report.generatedAt.slice(0, 10);
  return slugify(`${report.title} ${generatedDate}`);
}

export function buildReportCsv(report: GeneratedReport) {
  const rows: Array<Array<string>> = [
    ["Report", report.title],
    ["Workspace", report.workspaceName],
    ["Template", report.templateLabel],
    ["Scope", report.scope === "company" ? report.companyName ?? "Company" : "Global workspace"],
    ["Period", report.periodLabel],
    ["Generated", new Date(report.generatedAt).toLocaleString()],
    ["Health score", `${report.summary.healthScore}/100 (${report.summary.healthStatus})`],
    ["Monitors", String(report.summary.monitorCount)],
    ["Currently up", String(report.summary.currentlyUp)],
    ["Currently down", String(report.summary.currentlyDown)],
    ["Currently pending", String(report.summary.currentlyPending)],
    ["Checks", String(report.summary.totalChecks)],
    ["Up checks", String(report.summary.upChecks)],
    ["Down checks", String(report.summary.downChecks)],
    ["Pending checks", String(report.summary.pendingChecks)],
    ["Uptime", `${report.summary.uptimePct.toFixed(2)}%`],
    ["Average latency", `${report.summary.averageLatencyMs}ms`],
    ["P95 latency", `${report.summary.p95LatencyMs}ms`],
    ["Failures", String(report.summary.failureEvents)],
    ["Failure rate", `${report.summary.failureRatePct.toFixed(2)}%`],
    ["Impacted monitors", String(report.summary.impactedMonitors)],
    [""],
    ["Recommended actions"],
    ...report.recommendations.map((item) => [item]),
    [""],
    ["Status code", "Count"],
    ...buildStatusCodeRows(report),
    [""],
    ["Top slow monitors", "Average latency", "Checks"],
    ...buildSlowMonitorRows(report),
    [""],
    ["Top failing monitors", "Failures", "Last failure"],
    ...buildFailingMonitorRows(report),
    [""],
    ["Recent failures", "Status code", "Time", "Detail"],
    ...buildRecentFailureRows(report),
    [""],
    ["Monitor", "Company", "URL", "Status", "Current code", "Uptime", "Avg latency", "P95 latency", "Checks", "Up checks", "Down checks", "Pending checks", "Failures", "Last checked", "Last failure", "Last error"],
    ...report.monitorBreakdown.map((monitor) => [
      monitor.name,
      monitor.companyName ?? EMPTY_REPORT_VALUE,
      monitor.url,
      monitor.status,
      reportValue(monitor.currentStatusCode),
      `${monitor.uptimePct.toFixed(2)}%`,
      `${monitor.averageLatencyMs}ms`,
      `${monitor.p95LatencyMs}ms`,
      String(monitor.totalChecks),
      String(monitor.upChecks),
      String(monitor.downChecks),
      String(monitor.pendingChecks),
      String(monitor.failures),
      monitor.lastCheckedAt ? new Date(monitor.lastCheckedAt).toLocaleString() : EMPTY_REPORT_VALUE,
      monitor.lastFailureAt ? new Date(monitor.lastFailureAt).toLocaleString() : EMPTY_REPORT_VALUE,
      monitor.lastErrorMessage ?? EMPTY_REPORT_VALUE,
    ]),
  ];

  return toCsv(rows);
}

export function buildPrintableReportHtml(
  report: GeneratedReport,
  options: { autoPrint?: boolean } = {}
) {
  const breakdownRows = report.monitorBreakdown
    .map(
      (monitor) => `
        <tr>
          <td>${escapeHtml(reportValue(monitor.name))}</td>
          <td>${escapeHtml(reportValue(monitor.companyName))}</td>
          <td>${escapeHtml(reportValue(monitor.status))}</td>
          <td>${escapeHtml(reportValue(monitor.currentStatusCode))}</td>
          <td>${escapeHtml(`${monitor.uptimePct.toFixed(2)}%`)}</td>
          <td>${escapeHtml(`${monitor.averageLatencyMs}ms`)}</td>
          <td>${escapeHtml(`${monitor.p95LatencyMs}ms`)}</td>
          <td>${escapeHtml(String(monitor.totalChecks))}</td>
          <td>${escapeHtml(String(monitor.failures))}</td>
          <td>${escapeHtml(monitor.lastFailureAt ? new Date(monitor.lastFailureAt).toLocaleString() : EMPTY_REPORT_VALUE)}</td>
        </tr>
      `
    )
    .join("");
  const statusCodeRows = buildStatusCodeRows(report)
    .map(
      ([statusCode, count]) => `
        <tr>
          <td>${escapeHtml(statusCode)}</td>
          <td>${escapeHtml(count)}</td>
        </tr>
      `
    )
    .join("");
  const recentFailureRows = buildRecentFailureRows(report)
    .map(
      ([name, statusCode, time, detail]) => `
        <tr>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(statusCode)}</td>
          <td>${escapeHtml(time)}</td>
          <td>${escapeHtml(detail)}</td>
        </tr>
      `
    )
    .join("");
  const slowMonitorRows = buildSlowMonitorRows(report)
    .map(
      ([name, latency, checks]) => `
        <tr>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(latency)}</td>
          <td>${escapeHtml(checks)}</td>
        </tr>
      `
    )
    .join("");
  const failingMonitorRows = buildFailingMonitorRows(report)
    .map(
      ([name, failures, lastFailure]) => `
        <tr>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(failures)}</td>
          <td>${escapeHtml(lastFailure)}</td>
        </tr>
      `
    )
    .join("");
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
          body { font-family: Arial, sans-serif; margin: 32px; color: #111827; }
          .hero { border: 1px solid #e5e7eb; border-radius: 20px; padding: 24px; margin-bottom: 24px; }
          .eyebrow { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #64748b; margin-bottom: 8px; }
          .summary { color: #475569; margin: 8px 0 0; }
          .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px; }
          .stat { border: 1px solid #e5e7eb; border-radius: 16px; padding: 14px; }
          .stat.emphasis { border-color: #bfdbfe; background: #eff6ff; }
          .stat-label { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #64748b; }
          .stat-value { font-size: 24px; font-weight: 700; margin-top: 8px; }
          .recommendations { border: 1px solid #bfdbfe; background: #eff6ff; border-radius: 16px; padding: 16px 18px; margin-bottom: 24px; }
          .recommendations li { margin: 6px 0; color: #1e3a8a; }
          .section-title { font-size: 18px; font-weight: 700; margin: 28px 0 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 10px 12px; text-align: left; font-size: 13px; }
          th { color: #475569; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; }
          .grid-two { display: grid; gap: 20px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
          @media print {
            body { margin: 16px; }
          }
        </style>
        ${autoPrintScript}
      </head>
      <body>
        <div class="hero">
          <div class="eyebrow">${escapeHtml(report.templateLabel)}</div>
          <h1>${escapeHtml(report.title)}</h1>
          <p class="summary">${escapeHtml(report.workspaceName)} | ${escapeHtml(report.periodLabel)} | ${escapeHtml(
            new Date(report.generatedAt).toLocaleString()
          )}</p>
        </div>

        <div class="stats">
          <div class="stat emphasis"><div class="stat-label">Health score</div><div class="stat-value">${report.summary.healthScore}/100</div></div>
          <div class="stat"><div class="stat-label">Monitors</div><div class="stat-value">${report.summary.monitorCount}</div></div>
          <div class="stat"><div class="stat-label">Uptime</div><div class="stat-value">${report.summary.uptimePct.toFixed(
            2
          )}%</div></div>
          <div class="stat"><div class="stat-label">P95 latency</div><div class="stat-value">${report.summary.p95LatencyMs}ms</div></div>
          <div class="stat"><div class="stat-label">Avg latency</div><div class="stat-value">${report.summary.averageLatencyMs}ms</div></div>
          <div class="stat"><div class="stat-label">Failures</div><div class="stat-value">${report.summary.failureEvents}</div></div>
          <div class="stat"><div class="stat-label">Failure rate</div><div class="stat-value">${report.summary.failureRatePct.toFixed(
            2
          )}%</div></div>
          <div class="stat"><div class="stat-label">Impacted</div><div class="stat-value">${report.summary.impactedMonitors}</div></div>
        </div>

        <div class="recommendations">
          <div class="eyebrow">Recommended actions</div>
          <ul>
            ${report.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>

        <div class="grid-two">
          <div>
            <div class="section-title">Status codes</div>
            <table>
              <thead>
                <tr>
                  <th>Status code</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>${statusCodeRows}</tbody>
            </table>
          </div>
          <div>
            <div class="section-title">Top slow monitors</div>
            <table>
              <thead>
                <tr>
                  <th>Monitor</th>
                  <th>Average latency</th>
                  <th>Checks</th>
                </tr>
              </thead>
              <tbody>${slowMonitorRows}</tbody>
            </table>
          </div>
        </div>

        <div class="section-title">Top failing monitors</div>
        <table>
          <thead>
            <tr>
              <th>Monitor</th>
              <th>Failures</th>
              <th>Last failure</th>
            </tr>
          </thead>
          <tbody>${failingMonitorRows}</tbody>
        </table>

        <div class="section-title">Recent failure events</div>
        <table>
          <thead>
            <tr>
              <th>Monitor</th>
              <th>Code</th>
              <th>Time</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>${recentFailureRows}</tbody>
        </table>

        <div class="section-title">Monitor breakdown</div>
        <table>
          <thead>
            <tr>
              <th>Monitor</th>
              <th>Company</th>
              <th>Status</th>
              <th>Code</th>
              <th>Uptime</th>
              <th>Avg latency</th>
              <th>P95</th>
              <th>Checks</th>
              <th>Failures</th>
              <th>Last failure</th>
            </tr>
          </thead>
          <tbody>${breakdownRows}</tbody>
        </table>
      </body>
    </html>
  `;
}

function buildStatusCodeRows(report: GeneratedReport) {
  if (report.statusCodes.length === 0) {
    return [["No data", "0"]];
  }

  return report.statusCodes.map((item) => [String(item.statusCode), String(item.count)]);
}

function buildSlowMonitorRows(report: GeneratedReport) {
  if (report.slowMonitors.length === 0) {
    return [["No data", "0ms", "0"]];
  }

  return report.slowMonitors.map((monitor) => [
    monitor.name,
    `${monitor.averageLatencyMs}ms`,
    String(monitor.checks),
  ]);
}

function buildFailingMonitorRows(report: GeneratedReport) {
  if (report.failingMonitors.length === 0) {
    return [["No data", "0", EMPTY_REPORT_VALUE]];
  }

  return report.failingMonitors.map((monitor) => [
    monitor.name,
    String(monitor.failures),
    monitor.lastFailureAt ? new Date(monitor.lastFailureAt).toLocaleString() : EMPTY_REPORT_VALUE,
  ]);
}

function buildRecentFailureRows(report: GeneratedReport) {
  if (report.recentFailures.length === 0) {
    return [["No data", EMPTY_REPORT_VALUE, EMPTY_REPORT_VALUE, "No failure events in this period."]];
  }

  return report.recentFailures.map((event) => [
    event.name,
    reportValue(event.statusCode),
    new Date(event.createdAt).toLocaleString(),
    event.rcaSummary ?? event.message ?? EMPTY_REPORT_VALUE,
  ]);
}

function toCsv(rows: Array<Array<string>>) {
  return rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(",")
    )
    .join("\n");
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
