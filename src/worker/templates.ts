import { getHttpStatusMeta } from "@/lib/http/status-codes";
import { getMonitorTargetDisplay } from "@/lib/monitors/targets";
import {
  DEFAULT_NOTIFICATION_TEMPLATES_BY_LANGUAGE,
  getDefaultNotificationTemplates,
  type NotificationLanguage,
  type SettingsPayload,
} from "@/lib/settings/types";
import type { NotificationContext } from "@/worker/types";

const LEGACY_DEFAULT_EMAIL_SUBJECTS = new Set([
  ...Object.values(DEFAULT_NOTIFICATION_TEMPLATES_BY_LANGUAGE).map((templates) =>
    normalizeForComparison(templates.defaultEmailSubjectTemplate)
  ),
]);
const LEGACY_DEFAULT_EMAIL_BODIES = new Set(
  Object.values(DEFAULT_NOTIFICATION_TEMPLATES_BY_LANGUAGE).map((templates) =>
    normalizeForComparison(templates.defaultEmailBodyTemplate)
  )
);
const LEGACY_DEFAULT_TELEGRAM_TEMPLATES = new Set([
  ...Object.values(DEFAULT_NOTIFICATION_TEMPLATES_BY_LANGUAGE).map((templates) =>
    normalizeForComparison(templates.defaultTelegramTemplate)
  ),
  normalizeForComparison(
    "{domain} ({url}) is now {event_state}\n\nTIME: {checked_at_local}\n\nSTATUS: {status_code} - {status_label}\nROOT CAUSE: {rca_summary}"
  ),
]);

export function renderNotificationTemplates(
  context: NotificationContext,
  settings: SettingsPayload,
  appUrl: string
) {
  const statusMeta = getHttpStatusMeta(context.result.statusCode);
  const language = settings.notifications.notificationLanguage;
  const domain = getDomain(context.monitor.url);
  const displayTarget = getMonitorTargetDisplay(context.monitor);
  const organization = settings.profile.organization || "Sentrovia Monitoring";
  const statusCode = String(context.result.statusCode ?? "N/A");
  const statusLabel = localizeStatusLabel(language, context, statusMeta?.label);
  const localTime = formatLocalDateTime(context.result.checkedAt);
  const eventState = resolveEventState(context, language);
  const downtimeStartedAt = context.monitor.lastFailureAt ? new Date(context.monitor.lastFailureAt) : context.result.checkedAt;
  const downtimeDuration = formatDuration(context.result.checkedAt.getTime() - downtimeStartedAt.getTime());
  const message = localizeMessage(language, context);
  const rcaTitle = localizeRcaTitle(language, context);
  const rcaSummary = localizeRcaSummary(language, context);
  const htmlUrlPlaceholder = "__SENTROVIA_URL_LINK__";
  const htmlDashboardPlaceholder = "__SENTROVIA_DASHBOARD_LINK__";
  const monitorLink =
    context.monitor.monitorType === "http"
      ? buildSafeAnchor(displayTarget, displayTarget)
      : escapeHtml(displayTarget);
  const dashboardLink = buildSafeAnchor(buildAppRouteUrl(appUrl, "/monitoring"), domain);

  const textReplacements = {
    "{name}": context.monitor.name,
    "{url}": displayTarget,
    "{url_link}": displayTarget,
    "{domain}": domain,
    "{dashboard_link}": `${appUrl}/monitoring`,
    "{status_code}": statusCode,
    "{status_label}": statusLabel,
    "{latency_ms}": String(context.result.latencyMs ?? "N/A"),
    "{slow_threshold_ms}": String(context.monitor.slowResponseThresholdMs ?? "N/A"),
    "{event_state}": eventState,
    "{checked_at}": context.result.checkedAt.toISOString(),
    "{checked_at_local}": localTime,
    "{downtime_started_at}": downtimeStartedAt.toISOString(),
    "{downtime_started_at_local}": formatLocalDateTime(downtimeStartedAt),
    "{downtime_duration}": downtimeDuration,
    "{downtime_minutes}": String(Math.max(0, Math.floor((context.result.checkedAt.getTime() - downtimeStartedAt.getTime()) / 60_000))),
    "{downtime_hours}": String(Math.max(0, Math.floor((context.result.checkedAt.getTime() - downtimeStartedAt.getTime()) / 3_600_000))),
    "{message}": message,
    "{failure_reason}": localizeFailureReason(language, context.result.failureReason),
    "{rca_type}": context.rca.type,
    "{rca_title}": rcaTitle,
    "{rca_summary}": rcaSummary,
    "{organization}": organization,
  };

  const subjectTemplate = resolveSubjectTemplate(context, settings, language);
  const bodyTemplate = normalizeTemplate(resolveEmailBodyTemplate(context, settings, language));
  const telegramTemplate = normalizeTemplate(resolveTelegramTemplate(context, settings, language));
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

function resolveSubjectTemplate(
  context: NotificationContext,
  settings: SettingsPayload,
  language: NotificationLanguage
) {
  if (context.kind === "downtime-reminder") {
    return resolveLanguageDefault(
      settings.notifications.prolongedDowntimeEmailSubjectTemplate,
      "prolongedDowntimeEmailSubjectTemplate",
      language
    );
  }

  const fallbackKey =
    context.kind === "recovery"
      ? "recoveryEmailSubjectTemplate"
      : "defaultEmailSubjectTemplate";
  const fallback = resolveLanguageDefault(settings.notifications[fallbackKey], fallbackKey, language);

  return resolveMonitorTemplate(context.monitor.emailSubject, fallback, LEGACY_DEFAULT_EMAIL_SUBJECTS);
}

function resolveEmailBodyTemplate(
  context: NotificationContext,
  settings: SettingsPayload,
  language: NotificationLanguage
) {
  if (context.kind === "downtime-reminder") {
    return resolveLanguageDefault(
      settings.notifications.prolongedDowntimeEmailBodyTemplate,
      "prolongedDowntimeEmailBodyTemplate",
      language
    );
  }

  const fallbackKey =
    context.kind === "recovery"
      ? "recoveryEmailBodyTemplate"
      : "defaultEmailBodyTemplate";
  const fallback = resolveLanguageDefault(settings.notifications[fallbackKey], fallbackKey, language);

  return resolveMonitorTemplate(context.monitor.emailBody, fallback, LEGACY_DEFAULT_EMAIL_BODIES);
}

function resolveTelegramTemplate(
  context: NotificationContext,
  settings: SettingsPayload,
  language: NotificationLanguage
) {
  if (context.kind === "downtime-reminder") {
    return resolveLanguageDefault(
      settings.notifications.prolongedDowntimeTelegramTemplate,
      "prolongedDowntimeTelegramTemplate",
      language
    );
  }

  const fallbackKey =
    context.kind === "recovery"
      ? "recoveryTelegramTemplate"
      : "defaultTelegramTemplate";
  const fallback = resolveLanguageDefault(settings.notifications[fallbackKey], fallbackKey, language);

  return resolveMonitorTemplate(context.monitor.telegramTemplate, fallback, LEGACY_DEFAULT_TELEGRAM_TEMPLATES);
}

function resolveEventState(context: NotificationContext, language: NotificationLanguage) {
  if (language === "tr") {
    return resolveTurkishEventState(context);
  }

  if (context.kind === "downtime-reminder") {
    return "DOWN";
  }

  if (context.kind === "latency") {
    return "SLOW";
  }

  if (context.kind === "failure" && context.result.failureReason === "timeout") {
    return "TIMEOUT";
  }

  return context.result.status === "up" ? "UP" : "DOWN";
}

function resolveTurkishEventState(context: NotificationContext) {
  if (context.kind === "downtime-reminder") {
    return "ERİŞİLEMİYOR";
  }

  if (context.kind === "latency") {
    return "YAVAŞ";
  }

  if (context.kind === "failure" && context.result.failureReason === "timeout") {
    return "ZAMAN AŞIMI";
  }

  return context.result.status === "up" ? "ERİŞİLEBİLİR" : "ERİŞİLEMİYOR";
}

function localizeStatusLabel(
  language: NotificationLanguage,
  context: NotificationContext,
  fallbackLabel: string | undefined
) {
  if (language !== "tr") {
    return fallbackLabel ?? (context.result.ok ? "Healthy Response" : "Unavailable");
  }

  const statusCode = context.result.statusCode;
  if (context.result.ok) {
    return "Sağlıklı yanıt";
  }

  if (statusCode === null) {
    return "Ulaşılamıyor";
  }

  if (statusCode >= 500) {
    return "Sunucu hatası";
  }

  if (statusCode >= 400) {
    return "İstemci hatası";
  }

  if (statusCode >= 300) {
    return "Yönlendirme";
  }

  return fallbackLabel ?? "Ulaşılamıyor";
}

function localizeFailureReason(language: NotificationLanguage, reason: string | null | undefined) {
  if (language !== "tr") {
    return reason ?? "none";
  }

  switch (reason) {
    case "timeout":
      return "zaman aşımı";
    case "http_status":
      return "http durum kodu";
    case "dns":
      return "dns";
    case "tls":
      return "tls sertifika";
    case "connection":
      return "bağlantı";
    case "assertion":
      return "içerik doğrulama";
    case "redirect":
      return "yönlendirme";
    case "database":
      return "veritabanı";
    case "network":
      return "ağ";
    default:
      return "yok";
  }
}

function localizeMessage(language: NotificationLanguage, context: NotificationContext) {
  if (language !== "tr") {
    return context.message;
  }

  return translateTurkishPatternMessage(context.message)
    ?? translateTurkishStaticMessage(context.message)
    ?? translateTurkishReasonMessage(context)
    ?? context.message;
}

function translateTurkishPatternMessage(message: string) {
  const timeoutMatch = message.match(/^Service did not respond within (.+)\.$/);
  if (timeoutMatch) {
    return `Servis ${timeoutMatch[1]} içinde yanıt vermedi.`;
  }

  const tcpTimeoutMatch = message.match(/^TCP service did not respond within (.+)\.$/);
  if (tcpTimeoutMatch) {
    return `TCP servisi ${tcpTimeoutMatch[1]} içinde yanıt vermedi.`;
  }

  const httpStatusMatch = message.match(/^Service returned HTTP (\d+)\.$/);
  if (httpStatusMatch) {
    return `Servis HTTP ${httpStatusMatch[1]} döndürdü.`;
  }

  const slowMatch = message.match(/^Service is online but slow: (\d+)ms exceeded the (\d+)ms threshold\.$/);
  if (slowMatch) {
    return `Servis çalışıyor ancak yavaş: ${slowMatch[1]}ms yanıt süresi ${slowMatch[2]}ms eşiğini aştı.`;
  }

  const downtimeHoursMatch = message.match(/^Service has been down for (\d+)h (\d+)m\.$/);
  if (downtimeHoursMatch) {
    return `Servis ${downtimeHoursMatch[1]}s ${downtimeHoursMatch[2]}dk süredir down.`;
  }

  const downtimeMinutesMatch = message.match(/^Service has been down for (\d+)m\.$/);
  if (downtimeMinutesMatch) {
    return `Servis ${downtimeMinutesMatch[1]}dk süredir down.`;
  }

  const statusChangeMatch = message.match(/^Status code changed from (\d+) to (\d+)\.$/);
  if (statusChangeMatch) {
    return `Durum kodu ${statusChangeMatch[1]} değerinden ${statusChangeMatch[2]} değerine değişti.`;
  }

  return null;
}

function translateTurkishStaticMessage(message: string) {
  if (message === "Service recovered and is responding again.") {
    return "Servis düzeldi ve yeniden yanıt veriyor.";
  }

  if (message === "DNS resolution failed for the monitored target.") {
    return "İzlenen hedef için DNS çözümlemesi başarısız oldu.";
  }

  if (message === "TLS or certificate validation failed for the monitored target.") {
    return "İzlenen hedef için TLS veya sertifika doğrulaması başarısız oldu.";
  }

  if (message === "Connection failed before the service returned a response.") {
    return "Servis yanıt döndürmeden önce bağlantı başarısız oldu.";
  }

  if (message === "Response assertion failed.") {
    return "Yanıt doğrulaması başarısız oldu.";
  }

  if (message === "Health check failed.") {
    return "Sağlık kontrolü başarısız oldu.";
  }

  return null;
}

function translateTurkishReasonMessage(context: NotificationContext) {
  switch (context.result.failureReason) {
    case "timeout":
      return "Servis yapılandırılan timeout süresi içinde yanıt vermedi.";
    case "dns":
      return "İzlenen hedef için DNS çözümlemesi başarısız oldu.";
    case "tls":
      return "İzlenen hedef için TLS veya sertifika doğrulaması başarısız oldu.";
    case "connection":
      return "Servis yanıt döndürmeden önce bağlantı başarısız oldu.";
    case "assertion":
      return "Yanıt doğrulaması başarısız oldu.";
    case "database":
      return "Veritabanı kontrolü başarısız oldu.";
    default:
      return null;
  }
}

function localizeRcaTitle(language: NotificationLanguage, context: NotificationContext) {
  if (language !== "tr") {
    return context.rca.title;
  }

  switch (context.result.failureReason) {
    case "timeout":
      return "Zaman Aşımı";
    case "dns":
      return "DNS Çözümleme Hatası";
    case "tls":
      return "TLS/Sertifika Hatası";
    case "connection":
      return "Bağlantı Hatası";
    case "assertion":
      return "Doğrulama Hatası";
    case "database":
      return "Veritabanı Bağlantı Hatası";
    default:
      break;
  }

  if (context.result.statusCode && context.result.statusCode >= 500) {
    return "Sunucu Hatası";
  }

  if (context.result.statusCode && context.result.statusCode >= 400) {
    return "İstemci Hatası";
  }

  return context.result.ok ? "Sağlıklı Yanıt" : "Ağ Hatası";
}

function localizeRcaSummary(language: NotificationLanguage, context: NotificationContext) {
  if (language !== "tr") {
    return context.rca.summary;
  }

  switch (context.result.failureReason) {
    case "timeout":
      return "Servis yapılandırılan timeout süresi içinde yanıt vermedi.";
    case "dns":
      return "Worker hedef host adını IP adresine çözümleyemedi.";
    case "tls":
      return "İstek TLS el sıkışması veya sertifika doğrulaması sırasında başarısız oldu.";
    case "connection":
      return "Hedefe bağlantı kurulmadan veya yanıt alınmadan önce bağlantı başarısız oldu.";
    case "assertion":
      return "Servis yanıt verdi ancak beklenen içerik veya JSON koşulu sağlanmadı.";
    case "database":
      return "Veritabanı bağlantısı veya doğrulama sorgusu başarısız oldu.";
    default:
      break;
  }

  if (context.result.statusCode && context.result.statusCode >= 500) {
    return "İstek uygulama katmanına ulaştı ancak servis veya bağımlı bir sistem hata döndürdü.";
  }

  if (context.result.statusCode && context.result.statusCode >= 400) {
    return "Endpoint erişilebilir durumda ancak isteği geçersiz, yetkisiz veya beklenen koşullara uymadığı için reddetti.";
  }

  return context.result.ok
    ? "Endpoint beklenen başarı aralığında yanıt verdi."
    : "Geçerli bir uygulama yanıtı alınmadan önce ağ katmanında hata oluştu.";
}

function resolveLanguageDefault(
  template: string,
  key: keyof typeof DEFAULT_NOTIFICATION_TEMPLATES_BY_LANGUAGE.en,
  language: NotificationLanguage
) {
  const normalized = normalizeForComparison(template);
  const isDefaultTemplate = Object.values(DEFAULT_NOTIFICATION_TEMPLATES_BY_LANGUAGE).some(
    (templates) => normalizeForComparison(templates[key]) === normalized
  );

  return isDefaultTemplate ? getDefaultNotificationTemplates(language)[key] : template;
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

function buildSafeAnchor(href: string | null, label: string) {
  const safeHref = href ? normalizeHttpHref(href) : null;

  if (!safeHref) {
    return escapeHtml(label);
  }

  return `<a href="${escapeHtml(safeHref)}">${escapeHtml(label)}</a>`;
}

function buildAppRouteUrl(appUrl: string, route: string) {
  const safeBaseUrl = normalizeHttpHref(appUrl);
  if (!safeBaseUrl) {
    return null;
  }

  return `${safeBaseUrl.replace(/\/+$/, "")}${route}`;
}

function normalizeHttpHref(value: string) {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
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
