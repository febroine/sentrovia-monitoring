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
  critical: { accent: "#b91c1c", text: "#991b1b", darkAccent: "#d98b8b", darkText: "#f0b0b0" },
  healthy: { accent: "#047857", text: "#065f46", darkAccent: "#8ecdb9", darkText: "#9ad5c1" },
  warning: { accent: "#a16207", text: "#854d0e", darkAccent: "#d9af70", darkText: "#f1c98e" },
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
    @media (prefers-color-scheme:dark){
      .email-canvas{background:#151a1c!important;color:#ecf4f0!important}
      .email-surface,.email-section{background:#202729!important}
      .email-surface{border-top-color:${tone.darkAccent}!important}
      .email-brand{color:#d2e0dc!important}
      .email-status,.email-status-value{color:${tone.darkText}!important}
      .email-title{color:#f3f7f5!important}
      .email-heading,.email-value{color:#ecf4f0!important}
      .email-copy{color:#b9cbc5!important}
      .email-target,.email-target-cell,.email-label,.email-muted{color:#a9bcb6!important}
      .email-summary{border-color:#3a484a!important}
      .summary-cell{border-left-color:#3a484a!important}
      .email-detail-cell{border-bottom-color:#3a484a!important}
      .email-footer{background:#1b2224!important;border-top-color:#3a484a!important;color:#9aafaa!important}
      .email-button-shell,.email-button-cell,.email-button{background:#16433c!important}
      .email-button-shell{border-color:#6eb7a1!important}
      .email-button{color:#ecf4f0!important}
      .email-link{color:#9ad5c1!important}
    }
    @media only screen and (max-width:520px){
      .email-canvas-pad{padding:14px 10px!important}
      .email-section,.email-footer{padding-left:22px!important;padding-right:22px!important}
      .email-title{font-size:25px!important}
      .email-action-cell,.email-target-cell{display:block!important;width:100%!important;text-align:left!important}
      .email-target-cell{padding:14px 0 0!important}
      .summary-cell{display:block!important;width:100%!important;box-sizing:border-box!important;padding:13px 0!important;border-left:0!important;border-top:1px solid #e2e8f0!important}
      .summary-cell:first-child{border-top:0!important}
      .email-value,.email-status-value{margin-top:3px!important}
    }
    @media (prefers-color-scheme:dark) and (max-width:520px){
      .summary-cell{border-top-color:#3a484a!important}
    }
  </style>
</head>
<body class="email-canvas" style="margin:0;padding:0;background:#f1f5f9;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.monitorTarget)} · ${escapeHtml(input.eventState)} · ${escapeHtml(input.status)}</div>
  <table class="email-canvas" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f1f5f9" style="background:#f1f5f9;border-collapse:collapse;">
    <tr><td class="email-canvas-pad" align="center" style="padding:34px 12px;">
      <table class="email-surface" role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:640px;background:#ffffff;border-collapse:collapse;border-top:3px solid ${tone.accent};">
        <tr><td class="email-section" bgcolor="#ffffff" style="background:#ffffff;padding:26px 32px 0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td class="email-brand" valign="top" style="font-size:12px;font-weight:700;line-height:1.4;letter-spacing:.03em;color:#0f766e;word-break:break-word;">${escapeHtml(input.brandName)}</td>
              <td align="right" valign="top"><span class="email-status" style="color:${tone.text};font-size:11px;font-weight:700;line-height:1.4;letter-spacing:.07em;white-space:nowrap;">${escapeHtml(input.eventState)}</span></td>
            </tr>
          </table>
        </td></tr>
        <tr><td class="email-section" bgcolor="#ffffff" style="background:#ffffff;padding:29px 32px 26px;">
          <h1 class="email-title" style="margin:0;font-size:28px;line-height:1.2;font-weight:700;letter-spacing:-.015em;color:#0f172a;word-break:break-word;">${escapeHtml(input.headline)}</h1>
          <p class="email-copy" style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#334155;">${escapeHtml(input.lead)}</p>
          ${renderPrimaryAction(input.primaryAction, input.monitorTarget)}
        </td></tr>
        <tr><td class="email-section" bgcolor="#ffffff" style="background:#ffffff;padding:0 32px;">
          ${renderSummary(input.checkedAt, input.status, input.duration, input.durationKind, copy, tone.text)}
        </td></tr>
        <tr><td class="email-section" bgcolor="#ffffff" style="background:#ffffff;padding:27px 32px 31px;">
          <h2 class="email-heading" style="margin:0 0 14px;font-size:15px;line-height:1.4;color:#0f172a;">${escapeHtml(input.contentTitle)}</h2>
          ${content}
        </td></tr>
        <tr><td class="email-footer" bgcolor="#f8fafc" style="border-top:1px solid #e2e8f0;background:#f8fafc;padding:18px 32px 20px;font-size:11px;line-height:1.55;color:#64748b;word-break:break-word;">
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

  return `<table class="email-summary" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
    <tr>${items.map(([label, value, isStatus], index) => `<td class="summary-cell" width="${index === 0 ? "27%" : index === 1 ? "24%" : "49%"}" valign="top" style="padding:16px 12px;${index > 0 ? "border-left:1px solid #e2e8f0;" : ""}">
      <div class="email-label" style="font-size:11px;line-height:1.4;color:#64748b;">${label}</div>
      <div class="${isStatus ? "email-status-value" : "email-value"}" style="margin-top:6px;font-size:15px;font-weight:700;line-height:1.4;color:${isStatus ? statusColor : "#0f172a"};word-break:break-word;">${escapeHtml(value)}</div>
    </td>`).join("")}</tr>
  </table>`;
}

function renderPrimaryAction(action: NotificationEmailInput["primaryAction"], monitorTarget: string) {
  if (!action) {
    return `<p class="email-target" style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#64748b;word-break:break-all;">${escapeHtml(monitorTarget)}</p>`;
  }

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:22px;">
    <tr><td class="email-action-cell" width="150" valign="middle" style="width:150px;">
      <table class="email-button-shell" role="presentation" cellspacing="0" cellpadding="0" border="0" bgcolor="#0f766e" style="background:#0f766e;border:1px solid #0f766e;border-collapse:collapse;">
        <tr><td class="email-button-cell" bgcolor="#0f766e" style="background:#0f766e;"><a class="email-button" href="${escapeHtml(action.href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#0f766e;color:#ffffff;padding:11px 17px;font-size:13px;font-weight:700;line-height:1.2;text-decoration:none;white-space:nowrap;">${escapeHtml(action.label)}</a></td></tr>
      </table>
    </td><td class="email-target-cell" valign="middle" style="padding-left:16px;font-size:12px;line-height:1.5;color:#64748b;word-break:break-all;">${escapeHtml(monitorTarget)}</td></tr>
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
    <td class="email-detail-cell email-label" valign="top" width="142" style="padding:9px 14px 9px 0;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;line-height:1.5;color:#64748b;">${applyInlineFormatting(label)}</td>
    <td class="email-detail-cell email-copy" valign="top" style="padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:14px;line-height:1.55;color:#334155;word-break:break-word;">${applyInlineFormatting(value)}</td>
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
