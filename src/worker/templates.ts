import { getHttpStatusMeta } from "@/lib/http/status-codes";
import { escapeHtml } from "@/lib/html";
import { getMonitorTargetDisplay } from "@/lib/monitors/targets";
import {
  DEFAULT_NOTIFICATION_TEMPLATES_BY_LANGUAGE,
  getDefaultNotificationTemplates,
  type NotificationLanguage,
  type SettingsPayload,
} from "@/lib/settings/types";
import type { NotificationContext } from "@/worker/types";
import { renderNotificationEmailHtml } from "@/worker/notification-email";

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
const NO_LEGACY_TEMPLATES = new Set<string>();

export function renderNotificationTemplates(
  context: NotificationContext,
  settings: SettingsPayload,
  appUrl: string
) {
  const statusMeta = getHttpStatusMeta(context.result.statusCode);
  const language = resolveNotificationLanguage(context.monitor.notificationLanguage, settings.notifications.notificationLanguage);
  const domain = getDomain(context.monitor.url);
  const displayTarget = getMonitorTargetDisplay(context.monitor);
  const organization = settings.profile.organization || "Sentrovia Monitoring";
  const statusCode = String(context.result.statusCode ?? "N/A");
  const statusLabel = localizeStatusLabel(language, context, statusMeta?.label);
  const localTime = formatLocalDateTime(
    context.result.checkedAt,
    settings.appearance.timeZone,
    settings.appearance.use24HourClock
  );
  const eventState = resolveEventState(context, language);
  const downtimeStartedAt = context.monitor.lastFailureAt ? new Date(context.monitor.lastFailureAt) : context.result.checkedAt;
  const downtimeDuration = formatDuration(context.result.checkedAt.getTime() - downtimeStartedAt.getTime());
  const message = localizeMessage(language, context);
  const rcaTitle = localizeRcaTitle(language, context);
  const rcaSummary = localizeRcaSummary(language, context);
  const htmlUrlPlaceholder = "__SENTROVIA_URL_LINK__";
  const htmlDashboardPlaceholder = "__SENTROVIA_DASHBOARD_LINK__";
  const links = buildNotificationLinks(context, appUrl, displayTarget, domain);

  const textReplacements = buildTemplateReplacements({
    appUrl,
    context,
    displayTarget,
    domain,
    downtimeDuration,
    downtimeStartedAt,
    eventState,
    language,
    localTime,
    message,
    organization,
    rcaSummary,
    rcaTitle,
    settings,
    statusCode,
    statusLabel,
  });

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
    htmlBody: renderNotificationEmailHtml({
      body: renderedHtmlSource,
      htmlFragments: {
        [htmlUrlPlaceholder]: links.monitor,
        [htmlDashboardPlaceholder]: links.dashboard,
      },
      brandName: settings.notifications.notificationEmailBrandName,
      footerText: settings.notifications.notificationEmailFooterText,
      monitorName: context.monitor.name,
      monitorTarget: displayTarget,
      eventState,
      checkedAt: localTime,
      status: `${statusCode} · ${statusLabel}`,
      duration: context.result.latencyMs === null ? "N/A" : `${context.result.latencyMs} ms`,
      durationKind: context.result.statusCode !== null || context.result.ok ? "response" : "check",
      hardTimeout: `${context.monitor.timeout} ms`,
      language,
      tone: resolveEmailTone(context),
    }),
    telegramBody: toPlainText(applyTemplate(telegramTemplate, textReplacements)),
  };
}

function buildNotificationLinks(
  context: NotificationContext,
  appUrl: string,
  displayTarget: string,
  domain: string
) {
  return {
    monitor: context.monitor.monitorType === "http"
      ? buildSafeAnchor(displayTarget, displayTarget)
      : escapeHtml(displayTarget),
    dashboard: buildSafeAnchor(buildAppRouteUrl(appUrl, "/monitoring"), domain),
  };
}

type TemplateReplacementInput = {
  appUrl: string;
  context: NotificationContext;
  displayTarget: string;
  domain: string;
  downtimeDuration: string;
  downtimeStartedAt: Date;
  eventState: string;
  language: NotificationLanguage;
  localTime: string;
  message: string;
  organization: string;
  rcaSummary: string;
  rcaTitle: string;
  settings: SettingsPayload;
  statusCode: string;
  statusLabel: string;
};

function buildTemplateReplacements(input: TemplateReplacementInput) {
  const { context, downtimeStartedAt, settings } = input;
  const downtimeMs = Math.max(0, context.result.checkedAt.getTime() - downtimeStartedAt.getTime());
  return {
    "{name}": context.monitor.name,
    "{url}": input.displayTarget,
    "{url_link}": input.displayTarget,
    "{domain}": input.domain,
    "{dashboard_link}": `${input.appUrl}/monitoring`,
    "{status_code}": input.statusCode,
    "{status_label}": input.statusLabel,
    "{latency_ms}": String(context.result.latencyMs ?? "N/A"),
    "{check_duration_ms}": String(context.result.latencyMs ?? "N/A"),
    "{slow_threshold_ms}": String(context.monitor.slowResponseThresholdMs ?? "N/A"),
    "{hard_timeout_ms}": String(context.monitor.timeout),
    "{event_state}": input.eventState,
    "{checked_at}": context.result.checkedAt.toISOString(),
    "{checked_at_local}": input.localTime,
    "{downtime_started_at}": downtimeStartedAt.toISOString(),
    "{downtime_started_at_local}": formatLocalDateTime(
      downtimeStartedAt,
      settings.appearance.timeZone,
      settings.appearance.use24HourClock
    ),
    "{downtime_duration}": input.downtimeDuration,
    "{downtime_minutes}": String(Math.floor(downtimeMs / 60_000)),
    "{downtime_hours}": String(Math.floor(downtimeMs / 3_600_000)),
    "{message}": input.message,
    "{failure_reason}": localizeFailureReason(input.language, context.result.failureReason),
    "{rca_type}": context.rca.type,
    "{rca_title}": input.rcaTitle,
    "{rca_summary}": input.rcaSummary,
    "{organization}": input.organization,
  };
}

function resolveNotificationLanguage(
  monitorLanguage: string | null | undefined,
  workspaceLanguage: NotificationLanguage
): NotificationLanguage {
  return monitorLanguage === "en" || monitorLanguage === "tr" ? monitorLanguage : workspaceLanguage;
}

type NotificationTemplateKey =
  | "defaultEmailSubjectTemplate"
  | "recoveryEmailSubjectTemplate"
  | "slowResponseEmailSubjectTemplate"
  | "prolongedDowntimeEmailSubjectTemplate"
  | "defaultEmailBodyTemplate"
  | "recoveryEmailBodyTemplate"
  | "slowResponseEmailBodyTemplate"
  | "prolongedDowntimeEmailBodyTemplate"
  | "defaultTelegramTemplate"
  | "recoveryTelegramTemplate"
  | "slowResponseTelegramTemplate"
  | "prolongedDowntimeTelegramTemplate";

type EventTemplateSources = {
  defaultKey: NotificationTemplateKey;
  recoveryKey: NotificationTemplateKey;
  latencyKey: NotificationTemplateKey;
  reminderKey: NotificationTemplateKey;
  monitorDefault: string | null;
  monitorLatency: string | null;
  defaultLegacy: Set<string>;
};

function resolveSubjectTemplate(
  context: NotificationContext,
  settings: SettingsPayload,
  language: NotificationLanguage
) {
  return resolveEventTemplate(context, settings, language, {
    defaultKey: "defaultEmailSubjectTemplate",
    recoveryKey: "recoveryEmailSubjectTemplate",
    latencyKey: "slowResponseEmailSubjectTemplate",
    reminderKey: "prolongedDowntimeEmailSubjectTemplate",
    monitorDefault: context.monitor.emailSubject,
    monitorLatency: context.monitor.slowResponseEmailSubject,
    defaultLegacy: LEGACY_DEFAULT_EMAIL_SUBJECTS,
  });
}

function resolveEmailBodyTemplate(
  context: NotificationContext,
  settings: SettingsPayload,
  language: NotificationLanguage
) {
  return resolveEventTemplate(context, settings, language, {
    defaultKey: "defaultEmailBodyTemplate",
    recoveryKey: "recoveryEmailBodyTemplate",
    latencyKey: "slowResponseEmailBodyTemplate",
    reminderKey: "prolongedDowntimeEmailBodyTemplate",
    monitorDefault: context.monitor.emailBody,
    monitorLatency: context.monitor.slowResponseEmailBody,
    defaultLegacy: LEGACY_DEFAULT_EMAIL_BODIES,
  });
}

function resolveTelegramTemplate(
  context: NotificationContext,
  settings: SettingsPayload,
  language: NotificationLanguage
) {
  return resolveEventTemplate(context, settings, language, {
    defaultKey: "defaultTelegramTemplate",
    recoveryKey: "recoveryTelegramTemplate",
    latencyKey: "slowResponseTelegramTemplate",
    reminderKey: "prolongedDowntimeTelegramTemplate",
    monitorDefault: context.monitor.telegramTemplate,
    monitorLatency: context.monitor.slowResponseTelegramTemplate,
    defaultLegacy: LEGACY_DEFAULT_TELEGRAM_TEMPLATES,
  });
}

function resolveEventTemplate(
  context: NotificationContext,
  settings: SettingsPayload,
  language: NotificationLanguage,
  sources: EventTemplateSources
) {
  if (context.kind === "latency") {
    const fallback = resolveLanguageDefault(
      settings.notifications[sources.latencyKey],
      sources.latencyKey,
      language
    );
    return resolveMonitorTemplate(sources.monitorLatency, fallback, NO_LEGACY_TEMPLATES);
  }

  if (context.kind === "downtime-reminder") {
    return resolveLanguageDefault(
      settings.notifications[sources.reminderKey],
      sources.reminderKey,
      language
    );
  }

  const key = context.kind === "recovery" ? sources.recoveryKey : sources.defaultKey;
  const fallback = resolveLanguageDefault(settings.notifications[key], key, language);
  return resolveMonitorTemplate(sources.monitorDefault, fallback, sources.defaultLegacy);
}


const EVENT_STATE_BY_LANGUAGE = {
  en: {
    "downtime-reminder": "DOWN",
    latency: "SLOW",
    "ssl-expiry": "SSL EXPIRING",
  },
  tr: {
    "downtime-reminder": "ERİŞİLEMİYOR",
    latency: "YAVAŞ",
    "ssl-expiry": "SSL SÜRESİ DOLUYOR",
  },
} as const;

function resolveEventState(context: NotificationContext, language: NotificationLanguage) {
  if (context.kind === "failure" && context.result.failureReason === "timeout") {
    return language === "tr" ? "ZAMAN AŞIMI" : "TIMEOUT";
  }

  const configuredState = EVENT_STATE_BY_LANGUAGE[language][
    context.kind as keyof (typeof EVENT_STATE_BY_LANGUAGE)[typeof language]
  ];
  if (configuredState) {
    return configuredState;
  }

  if (language === "tr") {
    return context.result.status === "up" ? "ERİŞİLEBİLİR" : "ERİŞİLEMİYOR";
  }

  return context.result.status === "up" ? "UP" : "DOWN";
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

const TURKISH_FAILURE_REASON_LABELS: Record<string, string> = {
  timeout: "zaman aşımı",
  http_status: "http durum kodu",
  dns: "dns",
  tls: "tls sertifika",
  connection: "bağlantı",
  assertion: "içerik doğrulama",
  redirect: "yönlendirme",
  database: "veritabanı",
  network: "ağ",
  configuration: "yapılandırma",
};

function localizeFailureReason(language: NotificationLanguage, reason: string | null | undefined) {
  if (language !== "tr") {
    return reason ?? "none";
  }

  return reason ? TURKISH_FAILURE_REASON_LABELS[reason] ?? "yok" : "yok";
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

  const hardTimeoutMatch = message.match(/^Service did not complete within the (.+) hard timeout\.$/);
  if (hardTimeoutMatch) {
    return `Servis ${hardTimeoutMatch[1]} kesin hata zaman aşımı içinde tamamlanmadı.`;
  }

  const networkTimeoutMatch = message.match(
    /^A network operation timed out after (.+); the configured hard timeout is (.+)\.$/
  );
  if (networkTimeoutMatch) {
    return `Ağ işlemi ${networkTimeoutMatch[1]} sonra zaman aşımına uğradı; yapılandırılan kesin hata sınırı ${networkTimeoutMatch[2]}.`;
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

  const certificateExpiryMatch = message.match(/^TLS certificate expires in (\d+) days? on (\d{4}-\d{2}-\d{2})\.$/);
  if (certificateExpiryMatch) {
    return `TLS sertifikasının süresi ${certificateExpiryMatch[2]} tarihinde, ${certificateExpiryMatch[1]} gün içinde dolacak.`;
  }

  const certificateExpiredMatch = message.match(/^TLS certificate expired on (\d{4}-\d{2}-\d{2})\.$/);
  if (certificateExpiredMatch) {
    return `TLS sertifikasının süresi ${certificateExpiredMatch[1]} tarihinde doldu.`;
  }

  return null;
}

const TURKISH_STATIC_MESSAGES: Record<string, string> = {
  "Service recovered and is responding again.": "Servis düzeldi ve yeniden yanıt veriyor.",
  "DNS resolution failed for the monitored target.": "İzlenen hedef için DNS çözümlemesi başarısız oldu.",
  "TLS or certificate validation failed for the monitored target.": "İzlenen hedef için TLS veya sertifika doğrulaması başarısız oldu.",
  "Connection failed before the service returned a response.": "Servis yanıt döndürmeden önce bağlantı başarısız oldu.",
  "Response assertion failed.": "Yanıt doğrulaması başarısız oldu.",
  "Health check failed.": "Sağlık kontrolü başarısız oldu.",
};

function translateTurkishStaticMessage(message: string) {
  return TURKISH_STATIC_MESSAGES[message] ?? null;
}


const TURKISH_REASON_MESSAGES: Record<string, string> = {
  timeout: "Servis yapılandırılan timeout süresi içinde yanıt vermedi.",
  dns: "İzlenen hedef için DNS çözümlemesi başarısız oldu.",
  tls: "İzlenen hedef için TLS veya sertifika doğrulaması başarısız oldu.",
  connection: "Servis yanıt döndürmeden önce bağlantı başarısız oldu.",
  assertion: "Yanıt doğrulaması başarısız oldu.",
  database: "Veritabanı kontrolü başarısız oldu.",
};

function translateTurkishReasonMessage(context: NotificationContext) {
  const reason = context.result.failureReason;
  return reason ? TURKISH_REASON_MESSAGES[reason] ?? null : null;
}


const TURKISH_RCA_TITLES: Record<string, string> = {
  timeout: "Zaman Aşımı",
  dns: "DNS Çözümleme Hatası",
  tls: "TLS/Sertifika Hatası",
  connection: "Bağlantı Hatası",
  assertion: "Doğrulama Hatası",
  database: "Veritabanı Bağlantı Hatası",
};

function localizeRcaTitle(language: NotificationLanguage, context: NotificationContext) {
  if (language !== "tr") {
    return context.rca.title;
  }

  const reason = context.result.failureReason;
  if (reason && TURKISH_RCA_TITLES[reason]) {
    return TURKISH_RCA_TITLES[reason];
  }

  if (context.result.statusCode && context.result.statusCode >= 500) {
    return "Sunucu Hatası";
  }

  if (context.result.statusCode && context.result.statusCode >= 400) {
    return "İstemci Hatası";
  }

  return context.result.ok ? "Sağlıklı Yanıt" : "Ağ Hatası";
}


const TURKISH_RCA_SUMMARIES: Record<string, string> = {
  timeout: "Servis yapılandırılan timeout süresi içinde yanıt vermedi.",
  dns: "Worker hedef host adını IP adresine çözümleyemedi.",
  tls: "İstek TLS el sıkışması veya sertifika doğrulaması sırasında başarısız oldu.",
  connection: "Hedefe bağlantı kurulmadan veya yanıt alınmadan önce bağlantı başarısız oldu.",
  assertion: "Servis yanıt verdi ancak beklenen içerik veya JSON koşulu sağlanmadı.",
  database: "Veritabanı bağlantısı veya doğrulama sorgusu başarısız oldu.",
};

function localizeRcaSummary(language: NotificationLanguage, context: NotificationContext) {
  if (language !== "tr") {
    return context.rca.summary;
  }

  const reason = context.result.failureReason;
  if (reason && TURKISH_RCA_SUMMARIES[reason]) {
    return TURKISH_RCA_SUMMARIES[reason];
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

function resolveEmailTone(context: NotificationContext) {
  if (context.kind === "recovery") return "healthy" as const;
  if (context.kind === "latency" || context.kind === "ssl-expiry") return "warning" as const;
  return "critical" as const;
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

function formatLocalDateTime(date: Date, timeZone: string, use24HourClock: boolean) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: use24HourClock ? "h23" : "h12",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const dayPeriod = use24HourClock ? "" : ` ${values.dayPeriod ?? ""}`.trimEnd();

    return `${values.day}.${values.month}.${values.year} ${values.hour}:${values.minute}:${values.second}${dayPeriod}`;
  } catch {
    return date.toISOString();
  }
}
