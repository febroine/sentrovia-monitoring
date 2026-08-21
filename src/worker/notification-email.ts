interface NotificationEmailInput {
  body: string;
  htmlFragments: Record<string, string>;
  organization: string;
  monitorName: string;
  monitorTarget: string;
  eventState: string;
  checkedAt: string;
  status: string;
  latency: string;
  dashboardUrl: string | null;
  language: "en" | "tr";
  tone: "critical" | "healthy" | "warning";
}

const TONES = {
  critical: { accent: "#c2410c", soft: "#fff7ed", text: "#9a3412" },
  healthy: { accent: "#047857", soft: "#ecfdf5", text: "#065f46" },
  warning: { accent: "#a16207", soft: "#fefce8", text: "#854d0e" },
} as const;

export function renderNotificationEmailHtml(input: NotificationEmailInput) {
  const tone = TONES[input.tone];
  const copy = getEmailCopy(input.language);
  const content = renderTemplateContent(input.body, input.htmlFragments);
  const dashboardLink = input.dashboardUrl
    ? `<a href="${escapeHtml(input.dashboardUrl)}" style="color:#475569;text-decoration:underline;">${copy.openMonitoring}</a>`
    : "";

  return `<!doctype html>
<html lang="${input.language}">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
  <style>@media only screen and (max-width:480px){.summary-cell{display:block!important;width:auto!important;border-left:0!important;border-top:1px solid #e2e8f0}.summary-cell:first-child{border-top:0!important}}</style>
</head>
<body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.monitorTarget)} · ${escapeHtml(input.eventState)} · ${escapeHtml(input.status)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f1f5f9" style="background:#f1f5f9;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dbe3ec;border-top:4px solid ${tone.accent};">
        <tr><td style="padding:20px 28px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="font-size:13px;font-weight:700;color:#475569;letter-spacing:.04em;">${escapeHtml(input.organization)}</td>
              <td align="right"><span style="display:inline-block;padding:5px 9px;background:${tone.soft};color:${tone.text};font-size:11px;font-weight:700;line-height:1;letter-spacing:.04em;">${escapeHtml(input.eventState)}</span></td>
            </tr>
          </table>
          <h1 style="margin:18px 0 5px;font-size:22px;line-height:1.3;color:#0f172a;">${escapeHtml(input.monitorName)}</h1>
          <p style="margin:0;font-size:14px;line-height:1.5;color:#64748b;word-break:break-word;">${escapeHtml(input.monitorTarget)}</p>
        </td></tr>
        <tr><td style="padding:0 28px 22px;">
          ${renderSummary(input.checkedAt, input.status, input.latency, copy)}
        </td></tr>
        <tr><td style="border-top:1px solid #e2e8f0;padding:22px 28px 20px;">
          ${content}
        </td></tr>
        <tr><td bgcolor="#f8fafc" style="border-top:1px solid #e2e8f0;background:#f8fafc;padding:15px 28px;font-size:12px;line-height:1.5;color:#64748b;">
          ${copy.footer}${dashboardLink ? ` &nbsp;·&nbsp; ${dashboardLink}` : ""}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderSummary(
  checkedAt: string,
  status: string,
  latency: string,
  copy: ReturnType<typeof getEmailCopy>
) {
  const items = [
    [copy.checked, checkedAt],
    [copy.status, status],
    [copy.response, latency],
  ];

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f8fafc" style="border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;">
    <tr>${items.map(([label, value], index) => `<td class="summary-cell" width="33.33%" valign="top" style="padding:12px 14px;${index > 0 ? "border-left:1px solid #e2e8f0;" : ""}">
      <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;">${label}</div>
      <div style="margin-top:5px;font-size:13px;font-weight:600;line-height:1.35;color:#0f172a;word-break:break-word;">${escapeHtml(value)}</div>
    </td>`).join("")}</tr>
  </table>`;
}

function getEmailCopy(language: "en" | "tr") {
  if (language === "tr") {
    return {
      checked: "Kontrol zamanı",
      status: "Durum",
      response: "Yanıt süresi",
      openMonitoring: "Monitörleri aç",
      footer: "Sentrovia izleme bildirimi",
    };
  }

  return {
    checked: "Checked",
    status: "Status",
    response: "Response",
    openMonitoring: "Open monitoring",
    footer: "Sentrovia monitoring notification",
  };
}

function renderTemplateContent(body: string, htmlFragments: Record<string, string>) {
  const protectedContent = protectHtmlFragments(escapeHtml(body), htmlFragments);
  const lines = protectedContent.body.split("\n");
  const blocks: string[] = [];
  let detailRows: string[] = [];

  const flushDetails = () => {
    if (detailRows.length === 0) return;
    blocks.push(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">${detailRows.join("")}</table>`);
    detailRows = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const detail = line.match(/^([^:]{1,40}):\s+(.+)$/);

    if (detail) {
      detailRows.push(renderDetailRow(detail[1], detail[2]));
      continue;
    }

    flushDetails();
    if (!line) continue;

    if (line.startsWith("## ")) {
      blocks.push(`<h2 style="margin:20px 0 8px;font-size:14px;line-height:1.4;color:#0f172a;">${applyInlineFormatting(line.slice(3))}</h2>`);
      continue;
    }

    if (line.startsWith("- ")) {
      blocks.push(`<div style="margin:7px 0;padding-left:14px;font-size:14px;line-height:1.6;color:#334155;">&bull;&nbsp; ${applyInlineFormatting(line.slice(2))}</div>`);
      continue;
    }

    blocks.push(`<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#334155;">${applyInlineFormatting(line)}</p>`);
  }

  flushDetails();
  const rendered = blocks.join("") || `<p style="margin:0;font-size:14px;color:#64748b;">No additional details.</p>`;
  return restoreHtmlFragments(rendered, protectedContent.fragments);
}

function renderDetailRow(label: string, value: string) {
  return `<tr>
    <td valign="top" width="132" style="padding:8px 12px 8px 0;border-bottom:1px solid #edf2f7;font-size:12px;font-weight:700;line-height:1.5;color:#64748b;">${applyInlineFormatting(label)}</td>
    <td valign="top" style="padding:8px 0;border-bottom:1px solid #edf2f7;font-size:14px;line-height:1.5;color:#1e293b;word-break:break-word;">${applyInlineFormatting(value)}</td>
  </tr>`;
}

function protectHtmlFragments(body: string, fragments: Record<string, string>) {
  const protectedFragments: Record<string, string> = {};
  const protectedBody = Object.entries(fragments).reduce((result, [token, html], index) => {
    const marker = `SENTROVIAHTMLFRAGMENT${index}TOKEN`;
    protectedFragments[marker] = html;
    return result.replaceAll(escapeHtml(token), marker);
  }, body);

  return { body: protectedBody, fragments: protectedFragments };
}

function restoreHtmlFragments(body: string, fragments: Record<string, string>) {
  return Object.entries(fragments).reduce(
    (result, [marker, html]) => result.replaceAll(marker, html),
    body
  );
}

function applyInlineFormatting(value: string) {
  return value
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
