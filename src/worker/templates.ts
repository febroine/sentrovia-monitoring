import { format } from "date-fns";
import { getHttpStatusMeta } from "@/lib/http/status-codes";
import { getMonitorTargetDisplay } from "@/lib/monitors/targets";
import type { SettingsPayload } from "@/lib/settings/types";
import type { NotificationContext } from "@/worker/types";

export function renderNotificationTemplates(
  context: NotificationContext,
  settings: SettingsPayload,
  appUrl: string
) {
  const statusMeta = getHttpStatusMeta(context.result.statusCode);
  const domain = getDomain(context.monitor.url);
  const displayTarget = getMonitorTargetDisplay(context.monitor);
  const organization = settings.profile.organization || "Sentrovia Monitoring";
  const statusCode = String(context.result.statusCode ?? "N/A");
  const statusLabel = statusMeta?.label ?? (context.result.ok ? "Healthy Response" : "Unavailable");
  const localTime = format(context.result.checkedAt, "dd.MM.yyyy HH:mm:ss");
  const eventState = context.result.status === "up" ? "UP" : "DOWN";
  const htmlUrlPlaceholder = "__SENTROVIA_URL_LINK__";
  const htmlDashboardPlaceholder = "__SENTROVIA_DASHBOARD_LINK__";
  const monitorLink =
    context.monitor.monitorType === "http"
      ? `<a href="${escapeHtml(context.monitor.url)}">${escapeHtml(context.monitor.url)}</a>`
      : escapeHtml(displayTarget);
  const dashboardLink = `<a href="${escapeHtml(appUrl)}/monitoring">${escapeHtml(domain)}</a>`;

  const textReplacements = {
    "{name}": context.monitor.name,
    "{url}": displayTarget,
    "{url_link}": displayTarget,
    "{domain}": domain,
    "{dashboard_link}": `${appUrl}/monitoring`,
    "{status_code}": statusCode,
    "{status_label}": statusLabel,
    "{event_state}": eventState,
    "{checked_at}": context.result.checkedAt.toISOString(),
    "{checked_at_local}": localTime,
    "{message}": context.message,
    "{rca_type}": context.rca.type,
    "{rca_title}": context.rca.title,
    "{rca_summary}": context.rca.summary,
    "{organization}": organization,
  };

  const subjectTemplate = context.monitor.emailSubject || settings.notifications.defaultEmailSubjectTemplate;
  const bodyTemplate = normalizeTemplate(context.monitor.emailBody || settings.notifications.defaultEmailBodyTemplate);
  const telegramTemplate = normalizeTemplate(context.monitor.telegramTemplate || settings.notifications.defaultTelegramTemplate);
  const renderedTextBody = applyTemplate(bodyTemplate, textReplacements);
  const renderedHtmlSource = applyTemplate(bodyTemplate, {
    ...textReplacements,
    "{url_link}": htmlUrlPlaceholder,
    "{dashboard_link}": htmlDashboardPlaceholder,
  });

  return {
    subject: applyTemplate(normalizeTemplate(subjectTemplate), textReplacements),
    textBody: toPlainText(renderedTextBody),
    htmlBody: toHtml(renderedHtmlSource, {
      [htmlUrlPlaceholder]: monitorLink,
      [htmlDashboardPlaceholder]: dashboardLink,
    }),
    telegramBody: toPlainText(applyTemplate(telegramTemplate, textReplacements)),
  };
}

function applyTemplate(template: string, replacements: Record<string, string>) {
  return Object.entries(replacements).reduce(
    (result, [token, value]) => result.split(token).join(value),
    template
  );
}

function toHtml(text: string, htmlFragments: Record<string, string>) {
  const escaped = escapeHtml(text);
  const linked = Object.entries(htmlFragments).reduce(
    (result, [token, value]) => result.replaceAll(escapeHtml(token), value),
    escaped
  );

  return linked
    .split("\n")
    .map((line) => {
      if (line.trim().length === 0) {
        return "<br />";
      }

      return `<p>${applyInlineFormatting(line)}</p>`;
    })
    .join("");
}

function normalizeTemplate(template: string) {
  return template.replaceAll("\r\n", "\n").replaceAll("\\n", "\n");
}

function toPlainText(text: string) {
  return text.replaceAll("**", "").replaceAll("_", "");
}

function applyInlineFormatting(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>");
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
