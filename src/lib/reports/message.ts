import type Mail from "nodemailer/lib/mailer";
import { escapeHtml } from "@/lib/html";
import { buildReportSnapshotRows } from "@/lib/reports/presentation";
import { buildPrintableReportHtml, buildReportFileSlug } from "@/lib/reports/export";
import {
  formatMonitorP95Latency,
  formatMonitorUptime,
  formatReportAverageLatency,
  formatReportFailureRate,
  formatReportHealthScore,
  formatReportP95Latency,
  formatReportUptime,
} from "@/lib/reports/metrics";
import type { GeneratedReport } from "@/lib/reports/types";

export type ReportDeliveryOptions = {
  deliveryDetailLevel: "summary" | "standard" | "full";
  includeOutageSummary: boolean;
  includeMonitorBreakdown: boolean;
  emailSubjectTemplate: string | null;
  emailIntroTemplate: string | null;
};

export function buildReportMessage(report: GeneratedReport, options: ReportDeliveryOptions) {
  const subjectPrefix =
    report.template === "executive"
      ? `[${report.workspaceName} Executive Report]`
      : report.template === "client"
        ? `[${report.workspaceName} Client Report]`
        : `[${report.workspaceName} Operations Report]`;
  const introLine =
    report.template === "executive"
      ? "Here is the service health summary for this period, focused on uptime and active risk."
      : report.template === "client"
        ? "Here is the customer-facing reliability summary for this period."
        : "Here is the reliability summary for this period, with the URLs that need attention first.";
  const subject = renderReportTemplate(options.emailSubjectTemplate, report) || `${subjectPrefix} ${report.title}`;
  const intro = renderReportTemplate(options.emailIntroTemplate, report) || introLine;
  const lines = [
    `${report.title}`,
    `${report.workspaceName}`,
    `${report.templateLabel}`,
    intro,
    `${report.periodLabel} (${formatReportTimestamp(report.periodStartedAt, report.timeZone)} - ${formatReportTimestamp(report.periodEndedAt, report.timeZone)} ${report.timeZone})`,
    "",
    `Health score: ${formatReportHealthScore(report.summary)} (${report.summary.healthStatus})`,
    `URLs tracked: ${report.summary.monitorCount}`,
    `Currently up: ${report.summary.currentlyUp}`,
    `Currently down: ${report.summary.currentlyDown}`,
    `Currently pending: ${report.summary.currentlyPending}`,
    `Uptime: ${formatReportUptime(report.summary)}`,
    `Average latency: ${formatReportAverageLatency(report.summary)}`,
    `P95 latency: ${formatReportP95Latency(report.summary)}`,
    `Failure events: ${report.summary.failureEvents}`,
    `Failure rate: ${formatReportFailureRate(report.summary)}`,
    `Impacted URLs: ${report.summary.impactedMonitors}`,
    "",
    "What needs attention:",
    ...report.recommendations.map((item) => `- ${item}`),
    "",
    ...buildReportTextDetailLines(report, options),
    "",
    "Attachments:",
    ...buildAttachmentTextLines(),
  ];

  return {
    subject,
    textBody: lines.join("\n"),
    htmlBody: buildReportEmailHtml(report, intro, options),
  };
}

function buildReportEmailHtml(report: GeneratedReport, introLine: string, options: ReportDeliveryOptions) {
  const scopeLabel = report.scope === "company" ? report.companyName ?? "Company" : "Workspace";
  const generatedAt = formatReportTimestamp(report.generatedAt, report.timeZone);
  const periodStartedAt = formatReportTimestamp(report.periodStartedAt, report.timeZone);
  const periodEndedAt = formatReportTimestamp(report.periodEndedAt, report.timeZone);
  const healthTheme = getEmailHealthTheme(report.summary.healthStatus);
  const preheader = `${report.title}: ${formatReportHealthScore(report.summary)} health, ${formatReportUptime(report.summary)} uptime.`;

  return [
    renderEmailDocumentStart(preheader),
    renderEmailReportHeader(report, scopeLabel, introLine),
    renderEmailReportingWindow(periodStartedAt, periodEndedAt, report.timeZone),
    renderEmailHealthBanner(report, healthTheme),
    renderEmailMetricsTable(report, healthTheme),
    renderEmailSnapshotSection(report),
    renderReportEmailDetailSections(report, options),
    renderEmailReportFooter(report, scopeLabel, generatedAt),
    renderEmailDocumentEnd(),
  ].join("");
}

function renderEmailDocumentStart(preheader: string) {
  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <style>
          :root { color-scheme: light; supported-color-schemes: light; }
          @media (prefers-color-scheme: dark) {
            .sentrovia-email-body { background-color: #eef2f7 !important; }
            .sentrovia-email-surface { background-color: #ffffff !important; }
            .sentrovia-email-text { color: #0f172a !important; }
            .sentrovia-email-muted { color: #475569 !important; }
          }
          [data-ogsc] .sentrovia-email-body { background-color: #eef2f7 !important; }
          [data-ogsc] .sentrovia-email-surface { background-color: #ffffff !important; }
          [data-ogsc] .sentrovia-email-text { color: #0f172a !important; }
          [data-ogsc] .sentrovia-email-muted { color: #475569 !important; }
        </style>
      </head>
      <body class="sentrovia-email-body" style="margin:0;padding:0;background-color:#eef2f7;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
        <div class="sentrovia-email-body" style="margin:0;padding:0;background-color:#eef2f7;color:#0f172a;font-family:Arial,Helvetica,sans-serif;-webkit-locale:'en';">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef2f7" style="border-collapse:collapse;background-color:#eef2f7;">
            <tr>
              <td align="center" style="padding:32px 12px;">
                <table role="presentation" width="760" cellpadding="0" cellspacing="0" class="sentrovia-email-surface" bgcolor="#ffffff" style="width:760px;max-width:100%;border-collapse:collapse;background-color:#ffffff;border:1px solid #cbd5e1;">
                  <tr>
                    <td height="4" bgcolor="#2563eb" style="height:4px;line-height:4px;font-size:4px;background-color:#2563eb;">&nbsp;</td>
                  </tr>`;
}

function renderEmailReportHeader(report: GeneratedReport, scopeLabel: string, introLine: string) {
  return `
    <tr>
      <td class="sentrovia-email-surface" bgcolor="#ffffff" style="padding:28px;background-color:#ffffff;color:#0f172a;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="padding:0;vertical-align:top;">
              <div class="sentrovia-email-text" style="font-size:14px;font-weight:700;color:#0f172a;-webkit-locale:'en';font-feature-settings:'locl' 0;">${escapeHtml(report.workspaceName)}</div>
              <div class="sentrovia-email-muted" style="margin-top:2px;font-size:11px;color:#475569;">Reliability intelligence</div>
            </td>
            <td align="right" style="padding:0;vertical-align:top;">
              <div class="sentrovia-email-muted" style="padding-top:2px;font-size:12px;font-weight:700;color:#475569;white-space:nowrap;">${escapeHtml(report.periodLabel)}</div>
            </td>
          </tr>
        </table>
        <h1 class="sentrovia-email-text" style="margin:22px 0 8px;font-size:27px;line-height:1.2;letter-spacing:-0.3px;color:#0f172a;">${escapeHtml(report.title)}</h1>
        <div class="sentrovia-email-muted" style="font-size:14px;line-height:1.6;color:#475569;">${escapeHtml(report.templateLabel)} / ${escapeHtml(scopeLabel)}</div>
        <p class="sentrovia-email-text" style="margin:14px 0 0;font-size:14px;line-height:1.7;color:#334155;">${escapeHtml(introLine)}</p>
      </td>
    </tr>`;
}

function renderEmailReportingWindow(periodStartedAt: string, periodEndedAt: string, timeZone: string) {
  return `
    <tr>
      <td style="padding:14px 24px 2px;">
        <div class="sentrovia-email-text" style="border-left:3px solid #2563eb;background-color:#f8fafc;padding:11px 13px;color:#1e3a8a;font-size:12px;line-height:1.6;">
          <strong>Reporting window:</strong> ${escapeHtml(periodStartedAt)} - ${escapeHtml(periodEndedAt)} (${escapeHtml(timeZone)})
        </div>
      </td>
    </tr>`;
}

function formatReportTimestamp(value: string, timeZone: string) {
  return new Date(value).toLocaleString("en-GB", { timeZone });
}

function renderEmailMetricsTable(report: GeneratedReport, healthTheme: ReturnType<typeof getEmailHealthTheme>) {
  return `
    <tr>
      <td style="padding:20px 24px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            ${renderEmailMetric("Health score", formatReportHealthScore(report.summary), report.summary.healthStatus, healthTheme)}
            ${renderEmailMetric("Uptime", formatReportUptime(report.summary), report.summary.hasCompletedChecks ? "Availability for this period" : "No completed checks in this period")}
            ${renderEmailMetric("P95 latency", formatReportP95Latency(report.summary), report.summary.hasLatencySamples ? `${formatReportAverageLatency(report.summary)} average` : "No latency samples in this period")}
          </tr>
          <tr>
            ${renderEmailMetric("Down now", String(report.summary.currentlyDown), `${report.summary.currentlyUp} up, ${report.summary.currentlyPending} pending`)}
            ${renderEmailMetric("Failure events", String(report.summary.failureEvents), `${report.summary.impactedMonitors} impacted URLs`)}
            ${renderEmailMetric("Failure rate", formatReportFailureRate(report.summary), report.summary.hasCompletedChecks ? "Share of completed checks that were down" : "No completed checks in this period")}
          </tr>
        </table>
      </td>
    </tr>`;
}

function renderEmailReportFooter(report: GeneratedReport, scopeLabel: string, generatedAt: string) {
  return `
    <tr>
      <td style="padding:18px 24px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid #e2e8f0;">
          <tr>
            <td class="sentrovia-email-muted" style="padding:16px 0 0;color:#475569;font-size:12px;line-height:1.6;">
              Prepared for ${escapeHtml(scopeLabel)} by <strong class="sentrovia-email-text" style="color:#0f172a;">${escapeHtml(report.workspaceName)}</strong><br />
              Generated at ${escapeHtml(generatedAt)}.
            </td>
            <td align="right" style="padding:16px 0 0;vertical-align:top;">
              <span class="sentrovia-email-muted" style="display:inline-block;padding:6px 9px;background-color:#f1f5f9;color:#475569;font-size:11px;font-weight:700;">${escapeHtml(buildAttachmentSummary())}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function renderEmailDocumentEnd() {
  return `
                </table>
              </td>
            </tr>
          </table>
        </div>
      </body>
    </html>
  `;
}

function buildReportTextDetailLines(report: GeneratedReport, options: ReportDeliveryOptions) {
  if (options.deliveryDetailLevel === "summary") {
    return [];
  }

  const lines = [
    "",
    "Latency watchlist:",
    ...report.slowMonitors
      .slice(0, options.deliveryDetailLevel === "full" ? 8 : 5)
      .map((monitor) => `- ${monitor.url}: ${monitor.averageLatencyMs}ms average latency`),
    "",
    "Top failing URLs:",
    ...report.failingMonitors
      .slice(0, options.deliveryDetailLevel === "full" ? 8 : 5)
      .map((monitor) => `- ${monitor.url}: ${monitor.failures} failures`),
  ];

  if (options.includeOutageSummary) {
    lines.push(
      "",
      "Failure details:",
      ...report.recentFailures
        .slice(0, options.deliveryDetailLevel === "full" ? 8 : 5)
        .map((event) => `- ${event.url}: ${event.statusCode ?? "N/A"} at ${new Date(event.createdAt).toLocaleString()} - ${event.detail}`)
    );
  }

  return lines;
}

function renderReportEmailDetailSections(report: GeneratedReport, options: ReportDeliveryOptions) {
  if (options.deliveryDetailLevel === "summary") {
    return renderEmailListSection("What needs attention", report.recommendations);
  }

  const detailLimit = options.deliveryDetailLevel === "full" ? 8 : 5;
  const sections = [
    renderEmailListSection("What needs attention", report.recommendations),
    renderEmailTableSection(
      "Top failing URLs",
      ["URL", "Failures", "Last failure"],
      report.failingMonitors.slice(0, detailLimit).map((monitor) => [
        monitor.url,
        String(monitor.failures),
        monitor.lastFailureAt ? new Date(monitor.lastFailureAt).toLocaleString() : "--",
      ])
    ),
    renderEmailTableSection(
      "Latency watchlist",
      ["URL", "Average"],
      report.slowMonitors.slice(0, detailLimit).map((monitor) => [
        monitor.url,
        `${monitor.averageLatencyMs}ms`,
      ])
    ),
  ];

  if (options.includeOutageSummary) {
    sections.push(
      renderEmailTableSection(
        "Failure details",
        ["URL", "Code", "Detail"],
        report.recentFailures.slice(0, detailLimit).map((event) => [
          event.url,
          event.statusCode ? String(event.statusCode) : "--",
          event.detail,
        ])
      )
    );
  }

  if (options.includeMonitorBreakdown && options.deliveryDetailLevel === "full") {
    sections.push(
      renderEmailTableSection(
        "URL breakdown",
        ["URL", "Uptime", "P95"],
        report.monitorBreakdown.slice(0, detailLimit).map((monitor) => [
          monitor.url,
          formatMonitorUptime(monitor),
          formatMonitorP95Latency(monitor),
        ])
      )
    );
  }

  return sections.join("");
}

type ReportAttachmentRequest = {
  label: string;
  build: () => Mail.Attachment | Promise<Mail.Attachment>;
};

export async function buildReportAttachments(report: GeneratedReport): Promise<Mail.Attachment[]> {
  const requests = getReportAttachmentRequests(report);
  const attachments: Mail.Attachment[] = [];

  for (const request of requests) {
    const attachment = await buildReportAttachmentSafely(request);
    if (attachment) {
      attachments.push(attachment);
    }
  }

  return attachments;
}

function getReportAttachmentRequests(report: GeneratedReport): ReportAttachmentRequest[] {
  const fileSlug = buildReportFileSlug(report);
  const requests: ReportAttachmentRequest[] = [];

  requests.push({
    label: "HTML",
    build: () => ({
      filename: `${fileSlug}.html`,
      content: buildPrintableReportHtml(report),
      contentType: "text/html; charset=utf-8",
    }),
  });

  return requests;
}

async function buildReportAttachmentSafely(request: ReportAttachmentRequest) {
  try {
    return await request.build();
  } catch (error) {
    console.warn(`[sentrovia] ${request.label} report attachment skipped: ${toMessage(error)}`);
    return null;
  }
}

type EmailHealthTheme = {
  border: string;
  foreground: string;
};

function renderEmailMetric(
  label: string,
  value: string,
  detail: string,
  theme?: EmailHealthTheme
) {
  const background = "#ffffff";
  const border = theme?.border ?? "#e2e8f0";
  const foreground = theme?.foreground ?? "#0f172a";

  return `
    <td width="33.33%" style="padding:0 6px 12px;vertical-align:top;">
      <div class="sentrovia-email-surface" style="border:1px solid ${border};padding:14px;background-color:${background};">
        <div class="sentrovia-email-muted" style="font-size:12px;font-weight:700;color:#475569;-webkit-locale:'en';font-feature-settings:'locl' 0;">${escapeHtml(label)}</div>
        <div style="margin-top:6px;font-size:22px;line-height:1.2;font-weight:700;color:${foreground};">${escapeHtml(value)}</div>
        <div class="sentrovia-email-muted" style="margin-top:4px;font-size:12px;line-height:1.5;color:#475569;">${escapeHtml(detail)}</div>
      </div>
    </td>
  `;
}

function renderEmailHealthBanner(report: GeneratedReport, theme: EmailHealthTheme) {
  const message = !report.summary.hasCompletedChecks
    ? "No completed checks were recorded in this report window. Health, uptime, and failure rate are unavailable."
    : report.summary.currentlyDown > 0
    ? `${report.summary.currentlyDown} URL${report.summary.currentlyDown === 1 ? " is" : "s are"} currently down and requires attention.`
    : "All monitored URLs are currently responding; review the period metrics below for trends.";

  return `
    <tr>
      <td style="padding:16px 24px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="sentrovia-email-surface" bgcolor="#ffffff" style="border-collapse:collapse;border:1px solid ${theme.border};background-color:#ffffff;">
          <tr>
            <td style="padding:14px 16px;">
              <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:${theme.foreground};">${escapeHtml(report.summary.healthStatus)} health</div>
              <div class="sentrovia-email-text" style="margin-top:4px;font-size:13px;line-height:1.55;color:#334155;">${escapeHtml(message)}</div>
            </td>
            <td align="right" style="padding:14px 16px;vertical-align:middle;">
              <span style="font-size:24px;font-weight:800;color:${theme.foreground};">${escapeHtml(formatReportHealthScore(report.summary))}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

function getEmailHealthTheme(status: string): EmailHealthTheme {
  if (status === "No data") {
    return { border: "#cbd5e1", foreground: "#475569" };
  }

  if (status === "Excellent" || status === "Stable") {
    return { border: "#a7f3d0", foreground: "#047857" };
  }

  if (status === "Watch") {
    return { border: "#fde68a", foreground: "#b45309" };
  }

  return { border: "#fecdd3", foreground: "#be123c" };
}

function renderEmailSnapshotSection(report: GeneratedReport) {
  return renderEmailTableSection("Service snapshot", ["Item", "Detail"], buildReportSnapshotRows(report));
}

function renderEmailListSection(title: string, items: string[]) {
  const safeItems = items.length > 0 ? items : ["No data in this period."];

  return `
    <tr>
      <td style="padding:12px 24px;">
        <h2 class="sentrovia-email-text" style="margin:0 0 10px;font-size:16px;color:#0f172a;">${escapeHtml(title)}</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          ${safeItems
            .map(
              (item) => `
                <tr>
                  <td class="sentrovia-email-text" style="padding:9px 0;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#334155;">${escapeHtml(item)}</td>
                </tr>
              `
            )
            .join("")}
        </table>
      </td>
    </tr>
  `;
}

function renderEmailTableSection(title: string, headers: string[], rows: string[][]) {
  const safeRows = rows.length > 0 ? rows : [headers.map((_, index) => (index === 0 ? "No data" : "--"))];

  return `
    <tr>
      <td style="padding:12px 24px;">
        <h2 class="sentrovia-email-text" style="margin:0 0 10px;font-size:16px;color:#0f172a;">${escapeHtml(title)}</h2>
        <table width="100%" cellpadding="0" cellspacing="0" class="sentrovia-email-surface" bgcolor="#ffffff" style="border-collapse:collapse;border:1px solid #e2e8f0;background-color:#ffffff;">
          <thead>
            <tr>
              ${headers.map((header) => `<th align="left" class="sentrovia-email-muted" bgcolor="#f1f5f9" style="padding:10px 12px;background-color:#f1f5f9;color:#475569;font-size:12px;font-weight:700;-webkit-locale:'en';font-feature-settings:'locl' 0;">${escapeHtml(header)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${safeRows
              .map(
                (row) => `
                  <tr>
                    ${row.map((cell) => `<td class="sentrovia-email-text" style="padding:10px 12px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.5;color:#334155;">${escapeHtml(cell)}</td>`).join("")}
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </td>
    </tr>
  `;
}


function renderReportTemplate(template: string | null, report: GeneratedReport) {
  if (!template) {
    return "";
  }

  const replacements: Record<string, string> = {
    "{title}": report.title,
    "{workspace}": report.workspaceName,
    "{brand}": report.workspaceName,
    "{scope}": report.scope === "company" ? report.companyName ?? "Company" : "Workspace",
    "{period}": report.periodLabel,
    "{template}": report.templateLabel,
    "{health_score}": formatReportHealthScore(report.summary),
    "{health_status}": report.summary.healthStatus,
    "{uptime}": formatReportUptime(report.summary),
    "{failure_rate}": formatReportFailureRate(report.summary),
    "{failures}": String(report.summary.failureEvents),
    "{down_now}": String(report.summary.currentlyDown),
    "{p95_latency}": formatReportP95Latency(report.summary),
    "{generated_at}": new Date(report.generatedAt).toLocaleString(),
  };

  return Object.entries(replacements).reduce(
    (result, [token, value]) => result.split(token).join(value),
    template
  );
}

function buildAttachmentTextLines() {
  return ["- HTML report attachment for browser viewing"];
}

function buildAttachmentSummary() {
  return "The HTML report attachment is included for browser viewing and sharing.";
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected report delivery failure.";
}
