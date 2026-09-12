import { escapeHtml } from "@/lib/html";

interface NotificationEmailInput {
  body: string;
  htmlFragments: Record<string, string>;
  brandName: string;
  footerText: string;
  monitorTarget: string;
  eventState: string;
  headline: string;
  lead: string;
  contentTitle: string;
  primaryAction: { href: string; label: string } | null;
  checkedAt: string;
  status: string;
  duration: string;
  durationKind: "response" | "check";
  language: "en" | "tr";
  tone: "critical" | "healthy" | "warning";
}

const TONES = {
  critical: { accent: "#b91c1c", soft: "#fef2f2", text: "#991b1b", darkAccent: "#ef4444", darkSoft: "#3b1518", darkText: "#fca5a5" },
  healthy: { accent: "#047857", soft: "#ecfdf5", text: "#065f46", darkAccent: "#34d399", darkSoft: "#0f2922", darkText: "#6ee7b7" },
  warning: { accent: "#a16207", soft: "#fefce8", text: "#854d0e", darkAccent: "#f59e0b", darkSoft: "#36260d", darkText: "#fcd34d" },
} as const;

export function renderNotificationEmailHtml(input: NotificationEmailInput) {
  const tone = TONES[input.tone];
  const copy = getEmailCopy(input.language);
  const content = renderTemplateContent(input.body, input.htmlFragments);
  return `<!doctype html>
<html lang="${input.language}">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
  <style>
    @media only screen and (max-width:600px){
      .email-header,.email-section,.email-footer{padding-left:20px!important;padding-right:20px!important}
      .email-title{font-size:24px!important}
      .summary-cell{display:block!important;width:auto!important;border-left:0!important;border-top:1px solid #e2e8f0}
      .summary-cell:first-child{border-top:0!important}
    }
    @media (prefers-color-scheme:dark){
      body,.email-canvas{background:#09090b!important;color:#f8fafc!important}
      .email-surface,.email-header,.email-section{background:#111113!important}
      .email-surface{border-top-color:${tone.darkAccent}!important}
      .email-summary,.email-footer{background:#16181c!important}
      .email-surface,.email-border,.email-summary,.summary-cell,.email-detail-cell{border-color:#2a2f36!important}
      .email-heading,.email-title,.email-copy,.email-value{color:#f8fafc!important}
      .email-muted,.email-label,.email-footer{color:#a8b2c1!important}
      .email-status{background:${tone.darkSoft}!important;color:${tone.darkText}!important}
      .email-status-value{color:${tone.darkText}!important}
      .email-button{background:#0f766e!important;color:#ffffff!important}
      .email-brand{color:#2dd4bf!important}
      .email-link{color:#5eead4!important}
    }
    [data-ogsc] .email-canvas{background:#09090b!important}
    [data-ogsc] .email-surface,[data-ogsc] .email-header,[data-ogsc] .email-section{background:#111113!important}
    [data-ogsc] .email-surface{border-top-color:${tone.darkAccent}!important}
    [data-ogsc] .email-summary,[data-ogsc] .email-footer{background:#16181c!important}
    [data-ogsc] .email-surface,[data-ogsc] .email-border,[data-ogsc] .email-summary,[data-ogsc] .summary-cell,[data-ogsc] .email-detail-cell{border-color:#2a2f36!important}
    [data-ogsc] .email-heading,[data-ogsc] .email-title,[data-ogsc] .email-copy,[data-ogsc] .email-value{color:#f8fafc!important}
    [data-ogsc] .email-muted,[data-ogsc] .email-label,[data-ogsc] .email-footer{color:#a8b2c1!important}
    [data-ogsc] .email-status{background:${tone.darkSoft}!important;color:${tone.darkText}!important}
    [data-ogsc] .email-status-value{color:${tone.darkText}!important}
    [data-ogsc] .email-button{background:#0f766e!important;color:#ffffff!important}
    [data-ogsc] .email-brand{color:#2dd4bf!important}
    [data-ogsc] .email-link{color:#5eead4!important}
  </style>
</head>
<body class="email-canvas" style="margin:0;background:#f1f5f9;color:#0f172a;font-family:'IBM Plex Sans',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.monitorTarget)} · ${escapeHtml(input.eventState)} · ${escapeHtml(input.status)}</div>
  <table class="email-canvas" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f1f5f9" style="background:#f1f5f9;">
    <tr><td align="center" style="padding:32px 12px;">
      <table class="email-surface" role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #dbe3ec;border-top:4px solid ${tone.accent};">
        <tr><td class="email-header" bgcolor="#ffffff" style="background:#ffffff;padding:24px 32px 28px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td class="email-brand" style="font-size:16px;font-weight:700;color:#0f766e;letter-spacing:-.01em;">${escapeHtml(input.brandName)}</td>
              <td align="right"><span class="email-status" style="display:inline-block;padding:7px 10px;background:${tone.soft};color:${tone.text};font-size:11px;font-weight:700;line-height:1;letter-spacing:.04em;">${escapeHtml(input.eventState)}</span></td>
            </tr>
          </table>
          <h1 class="email-title" style="margin:28px 0 6px;font-size:28px;line-height:1.25;letter-spacing:-.02em;color:#0f172a;">${escapeHtml(input.headline)}</h1>
          <p class="email-muted" style="margin:0;font-size:14px;line-height:1.55;color:#64748b;word-break:break-word;">${escapeHtml(input.monitorTarget)}</p>
          <p class="email-copy" style="margin:16px 0 0;font-size:15px;line-height:1.65;color:#334155;">${escapeHtml(input.lead)}</p>
          ${renderPrimaryAction(input.primaryAction)}
        </td></tr>
        <tr><td class="email-section email-border" bgcolor="#ffffff" style="border-top:1px solid #e2e8f0;background:#ffffff;padding:24px 32px;">
          ${renderSummary(input.checkedAt, input.status, input.duration, input.durationKind, copy, tone.text)}
        </td></tr>
        <tr><td class="email-section email-border" bgcolor="#ffffff" style="border-top:1px solid #e2e8f0;background:#ffffff;padding:26px 32px 24px;">
          <h2 class="email-heading" style="margin:0 0 14px;font-size:18px;line-height:1.4;color:#0f172a;">${escapeHtml(input.contentTitle)}</h2>
          ${content}
        </td></tr>
        <tr><td class="email-footer email-border" bgcolor="#f8fafc" style="border-top:1px solid #e2e8f0;background:#f8fafc;padding:17px 32px;font-size:12px;line-height:1.5;color:#64748b;">
          ${escapeHtml(input.footerText || copy.footer)}
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
  duration: string,
  durationKind: NotificationEmailInput["durationKind"],
  copy: ReturnType<typeof getEmailCopy>,
  statusColor: string
) {
  const items: Array<[string, string, boolean]> = [
    [copy.status, status, true],
    [durationKind === "response" ? copy.response : copy.checkDuration, duration, false],
    [copy.checked, checkedAt, false],
  ];

  return `<table class="email-summary" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f8fafc" style="border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;">
    <tr>${items.map(([label, value, isStatus], index) => `<td class="summary-cell" width="33.33%" valign="top" style="padding:14px 14px;${index > 0 ? "border-left:1px solid #e2e8f0;" : ""}">
      <div class="email-label" style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;">${label}</div>
      <div class="${isStatus ? "email-status-value" : "email-value"}" style="margin-top:6px;font-size:13px;font-weight:600;line-height:1.4;color:${isStatus ? statusColor : "#0f172a"};word-break:break-word;">${escapeHtml(value)}</div>
    </td>`).join("")}</tr>
  </table>`;
}

function renderPrimaryAction(action: NotificationEmailInput["primaryAction"]) {
  if (!action) return "";

  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;">
    <tr><td bgcolor="#0f766e" style="background:#0f766e;border-radius:5px;">
      <a class="email-button" href="${escapeHtml(action.href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#0f766e;color:#ffffff;padding:12px 20px;font-size:14px;font-weight:700;line-height:1;text-decoration:none;border-radius:5px;">${escapeHtml(action.label)}</a>
    </td></tr>
  </table>`;
}

function getEmailCopy(language: "en" | "tr") {
  if (language === "tr") {
    return {
      checked: "Kontrol zamanı",
      status: "Durum",
      response: "Yanıt süresi",
      checkDuration: "Kontrol süresi",
      footer: "Sentrovia izleme bildirimi",
    };
  }

  return {
    checked: "Checked",
    status: "Status",
    response: "Response time",
    checkDuration: "Check duration",
    footer: "Sentrovia monitoring notification",
  };
}

function renderTemplateContent(body: string, htmlFragments: Record<string, string>) {
  const protectedContent = protectHtmlFragments(escapeHtml(body), htmlFragments);
  const lines = protectedContent.body.split("\n");
  const blocks: string[] = [];
  let detailRows: string[] = [];
  let renderedDetails = false;

  const flushDetails = () => {
    if (detailRows.length === 0) return;
    blocks.push(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">${detailRows.join("")}</table>`);
    detailRows = [];
    renderedDetails = true;
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
      blocks.push(`<h2 class="email-heading" style="margin:20px 0 8px;font-size:14px;line-height:1.4;color:#0f172a;">${applyInlineFormatting(line.slice(3))}</h2>`);
      continue;
    }

    if (line.startsWith("- ")) {
      blocks.push(`<div class="email-copy" style="margin:7px 0;padding-left:14px;font-size:14px;line-height:1.6;color:#334155;">&bull;&nbsp; ${applyInlineFormatting(line.slice(2))}</div>`);
      continue;
    }

    const topMargin = renderedDetails ? "16px" : "0";
    blocks.push(`<p class="email-copy" style="margin:${topMargin} 0 12px;font-size:14px;line-height:1.65;color:#334155;">${applyInlineFormatting(line)}</p>`);
  }

  flushDetails();
  const rendered = blocks.join("") || `<p class="email-muted" style="margin:0;font-size:14px;color:#64748b;">No additional details.</p>`;
  return restoreHtmlFragments(rendered, protectedContent.fragments);
}

function renderDetailRow(label: string, value: string) {
  return `<tr>
    <td class="email-detail-cell email-label" valign="top" width="142" style="padding:9px 14px 9px 0;border-bottom:1px solid #edf2f7;font-size:12px;font-weight:700;line-height:1.5;color:#64748b;">${applyInlineFormatting(label)}</td>
    <td class="email-detail-cell email-copy" valign="top" style="padding:9px 0;border-bottom:1px solid #edf2f7;font-size:14px;line-height:1.55;color:#1e293b;word-break:break-word;">${applyInlineFormatting(value)}</td>
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
