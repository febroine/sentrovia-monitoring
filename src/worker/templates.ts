import { getHttpStatusMeta } from "@/lib/http/status-codes";
import { getMonitorTargetDisplay } from "@/lib/monitors/targets";
import { DEFAULT_NOTIFICATION_TEMPLATES, type SettingsPayload } from "@/lib/settings/types";
import type { NotificationContext } from "@/worker/types";

const LEGACY_DEFAULT_EMAIL_SUBJECTS = new Set([
  normalizeForComparison(DEFAULT_NOTIFICATION_TEMPLATES.defaultEmailSubjectTemplate),
]);
const LEGACY_DEFAULT_EMAIL_BODIES = new Set([normalizeForComparison(DEFAULT_NOTIFICATION_TEMPLATES.defaultEmailBodyTemplate)]);
const LEGACY_DEFAULT_TELEGRAM_TEMPLATES = new Set([
  normalizeForComparison(DEFAULT_NOTIFICATION_TEMPLATES.defaultTelegramTemplate),
]);

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
  const localTime = formatLocalDateTime(context.result.checkedAt);
  const eventState = context.kind === "downtime-reminder" ? "DOWN" : context.result.status === "up" ? "UP" : "DOWN";
  const downtimeStartedAt = context.monitor.lastFailureAt ? new Date(context.monitor.lastFailureAt) : context.result.checkedAt;
  const downtimeDuration = formatDuration(context.result.checkedAt.getTime() - downtimeStartedAt.getTime());
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
    "{downtime_started_at}": downtimeStartedAt.toISOString(),
    "{downtime_started_at_local}": formatLocalDateTime(downtimeStartedAt),
    "{downtime_duration}": downtimeDuration,
    "{downtime_minutes}": String(Math.max(0, Math.floor((context.result.checkedAt.getTime() - downtimeStartedAt.getTime()) / 60_000))),
    "{downtime_hours}": String(Math.max(0, Math.floor((context.result.checkedAt.getTime() - downtimeStartedAt.getTime()) / 3_600_000))),
    "{message}": context.message,
    "{rca_type}": context.rca.type,
    "{rca_title}": context.rca.title,
    "{rca_summary}": context.rca.summary,
    "{organization}": organization,
  };

  const subjectTemplate = resolveSubjectTemplate(context, settings);
  const bodyTemplate = normalizeTemplate(resolveEmailBodyTemplate(context, settings));
  const telegramTemplate = normalizeTemplate(resolveTelegramTemplate(context, settings));
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

function resolveSubjectTemplate(context: NotificationContext, settings: SettingsPayload) {
  if (context.kind === "downtime-reminder") {
    return settings.notifications.prolongedDowntimeEmailSubjectTemplate;
  }

  const fallback =
    context.kind === "recovery"
      ? settings.notifications.recoveryEmailSubjectTemplate
      : settings.notifications.defaultEmailSubjectTemplate;

  return resolveMonitorTemplate(context.monitor.emailSubject, fallback, LEGACY_DEFAULT_EMAIL_SUBJECTS);
}

function resolveEmailBodyTemplate(context: NotificationContext, settings: SettingsPayload) {
  if (context.kind === "downtime-reminder") {
    return settings.notifications.prolongedDowntimeEmailBodyTemplate;
  }

  const fallback =
    context.kind === "recovery"
      ? settings.notifications.recoveryEmailBodyTemplate
      : settings.notifications.defaultEmailBodyTemplate;

  return resolveMonitorTemplate(context.monitor.emailBody, fallback, LEGACY_DEFAULT_EMAIL_BODIES);
}

function resolveTelegramTemplate(context: NotificationContext, settings: SettingsPayload) {
  if (context.kind === "downtime-reminder") {
    return settings.notifications.prolongedDowntimeTelegramTemplate;
  }

  const fallback =
    context.kind === "recovery"
      ? settings.notifications.recoveryTelegramTemplate
      : settings.notifications.defaultTelegramTemplate;

  return resolveMonitorTemplate(context.monitor.telegramTemplate, fallback, LEGACY_DEFAULT_TELEGRAM_TEMPLATES);
}

function resolveMonitorTemplate(template: string | null, fallback: string, legacyDefaults: Set<string>) {
  const normalized = normalizeForComparison(template);
  if (!normalized || legacyDefaults.has(normalized)) {
    return fallback;
  }

  return template ?? fallback;
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

function normalizeForComparison(template: string | null) {
  return template ? normalizeTemplate(template).trim() : "";
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

function formatDuration(durationMs: number) {
  const safeDurationMs = Math.max(0, durationMs);
  const totalMinutes = Math.floor(safeDurationMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes}m`);
  }

  return parts.join(" ");
}

function formatLocalDateTime(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
