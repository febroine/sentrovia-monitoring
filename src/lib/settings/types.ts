import type { DashboardFocus, DashboardWidgetId } from "@/lib/dashboard/preferences";
import type { UserRole } from "@/lib/auth/permissions";

export interface SettingsPayload {
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    role: UserRole;
    department: string;
    username: string;
    organization: string;
    jobTitle: string;
    phone: string;
  };
  notifications: {
    notificationLanguage: NotificationLanguage;
    defaultMonitorNotificationPref: DefaultMonitorNotificationPref;
    notifyOnDown: boolean;
    notifyOnRecovery: boolean;
    notifyOnStatusChange: boolean;
    notifyOnLatency: boolean;
    prolongedDowntimeEnabled: boolean;
    prolongedDowntimeMinutes: number;
    alertDedupMinutes: number;
    smtpHost: string;
    smtpPort: number;
    smtpUsername: string;
    smtpPassword: string;
    smtpPasswordConfigured: boolean;
    smtpFromEmail: string;
    smtpDefaultToEmail: string;
    smtpSecure: boolean;
    smtpRequireTls: boolean;
    smtpInsecureSkipVerify: boolean;
    discordWebhookUrl: string;
    discordEnabled: boolean;
    notificationEmailBrandName: string;
    notificationEmailFooterText: string;
    defaultEmailSubjectTemplate: string;
    defaultEmailHeadlineTemplate: string;
    defaultEmailBodyTemplate: string;
    defaultTelegramTemplate: string;
    slowResponseEmailSubjectTemplate: string;
    slowResponseEmailHeadlineTemplate: string;
    slowResponseEmailBodyTemplate: string;
    slowResponseTelegramTemplate: string;
    defaultTelegramBotToken: string;
    defaultTelegramBotTokenConfigured: boolean;
    defaultTelegramChatId: string;
    recoveryEmailSubjectTemplate: string;
    recoveryEmailHeadlineTemplate: string;
    recoveryEmailBodyTemplate: string;
    recoveryTelegramTemplate: string;
    prolongedDowntimeEmailSubjectTemplate: string;
    prolongedDowntimeEmailHeadlineTemplate: string;
    prolongedDowntimeEmailBodyTemplate: string;
    prolongedDowntimeTelegramTemplate: string;
    sslExpiryEmailSubjectTemplate: string;
    sslExpiryEmailHeadlineTemplate: string;
    sslExpiryEmailBodyTemplate: string;
    sslExpiryTelegramTemplate: string;
    statusCodeAlertCodes: string;
    savedEmailRecipients: string[];
  };
  monitoring: {
    interval: string;
    timeout: number;
    slowResponseThresholdMs: number | null;
    retries: number;
    batchSize: number;
    method: string;
    responseMaxLength: number;
    maxRedirects: number;
    checkSslExpiry: boolean;
    ignoreSslErrors: boolean;
    cacheBuster: boolean;
    saveErrorPages: boolean;
    saveSuccessPages: boolean;
  };
  appearance: {
    reduceMotion: boolean;
    compactDensity: boolean;
    sidebarAccent: string;
    dashboardLandingPage: string;
    dashboardWidgets: DashboardWidgetId[];
    dashboardCompanyId: string;
    dashboardFocus: DashboardFocus;
    showOutageBanner: boolean;
    showChartsSection: boolean;
    highContrastSurfaces: boolean;
    timeZone: string;
    use24HourClock: boolean;
  };
  publicStatus: {
    enabled: boolean;
    slug: string;
    title: string;
    summary: string;
    companyId: string;
  };
  data: {
    retentionDays: number;
    deliveryRetentionDays: number;
    autoBackupEnabled: boolean;
    backupWindow: string;
    backupRetentionCount: number;
    lastBackupStatus: "completed" | "failed" | "running" | null;
    lastBackupError: string | null;
    lastAutomaticBackupAt: string | null;
    eventRetentionDays: number;
    lastBackupAt: string | null;
  };
}

export type NotificationLanguage = "en" | "tr";
export type DefaultMonitorNotificationPref = "email" | "telegram" | "both" | "none";

export const DEFAULT_NOTIFICATION_TEMPLATES_BY_LANGUAGE = {
  en: {
    defaultEmailSubjectTemplate: "[Sentrovia] {domain} is {event_state} ({status_code})",
    defaultEmailHeadlineTemplate: "{name} is down",
    defaultEmailBodyTemplate:
      "Monitor: {domain}\nCheck site: {url}\nStatus: {status_code} - {status_label}\nFailure reason: {failure_reason}\nRoot cause: {rca_summary}\nDetails: {message}\nHard timeout: {hard_timeout_ms} ms\nOrganization: {organization}\n\n## Recommended checks\n- {rca_details}",
    defaultTelegramTemplate:
      "Monitor: {domain} ({url}) is now {event_state}\nTime: {checked_at_local}\nStatus: {status_code} - {status_label}\nRoot cause: {rca_summary}\nDetails: {message}\nOrganization: {organization}",
    slowResponseEmailSubjectTemplate: "[Sentrovia] {domain} is responding slowly ({latency_ms} ms)",
    slowResponseEmailHeadlineTemplate: "{name} is responding slowly",
    slowResponseEmailBodyTemplate:
      "Monitor: {domain}\nCheck site: {url}\nDetails: {message}\nResponse time: {latency_ms} ms\nSlow threshold: {slow_threshold_ms} ms\nHard timeout: {hard_timeout_ms} ms\nStatus: {status_code} - {status_label}\nOrganization: {organization}\n\n## Recommended checks\n- Review recent application and dependency latency before the hard timeout is reached.",
    slowResponseTelegramTemplate:
      "Monitor: {domain} ({url}) is online but responding slowly\nTime: {checked_at_local}\nResponse time: {latency_ms} ms\nSlow threshold: {slow_threshold_ms} ms\nHard timeout: {hard_timeout_ms} ms\nStatus: {status_code} - {status_label}\nOrganization: {organization}",
    recoveryEmailSubjectTemplate: "[Sentrovia] {domain} recovered ({status_code})",
    recoveryEmailHeadlineTemplate: "{name} is back online",
    recoveryEmailBodyTemplate:
      "Monitor: {domain}\nCheck site: {url}\nDetails: {message}\nDowntime before recovery: {downtime_duration}\nRecovered at: {checked_at_local}\nStatus: {status_code} - {status_label}\nOrganization: {organization}",
    recoveryTelegramTemplate:
      "Monitor: {domain} ({url}) recovered\nTime: {checked_at_local}\nStatus: {status_code} - {status_label}\nRoot cause: {rca_summary}\nDetails: {message}\nOrganization: {organization}",
    prolongedDowntimeEmailSubjectTemplate: "[Sentrovia] {domain} has been DOWN for {downtime_duration}",
    prolongedDowntimeEmailHeadlineTemplate: "{name} is still down",
    prolongedDowntimeEmailBodyTemplate:
      "Monitor: {domain}\nCheck site: {url}\nDetails: {message}\nCurrent downtime: {downtime_duration}\nStarted at: {downtime_started_at_local}\nStatus: {status_code} - {status_label}\nRoot cause: {rca_summary}\nOrganization: {organization}\n\n## Recommended checks\n- {rca_details}",
    prolongedDowntimeTelegramTemplate:
      "Monitor: {domain} ({url}) is still DOWN for {downtime_duration}\nStarted at: {downtime_started_at_local}\nLast checked: {checked_at_local}\nStatus: {status_code} - {status_label}\nRoot cause: {rca_summary}\nDetails: {message}\nOrganization: {organization}",
    sslExpiryEmailSubjectTemplate: "[Sentrovia] {domain} SSL EXPIRING",
    sslExpiryEmailHeadlineTemplate: "{name} certificate expires soon",
    sslExpiryEmailBodyTemplate:
      "Certificate status: {message}\nChecked at: {checked_at_local}\nOrganization: {organization}\n\n## Recommended checks\n- Open the site and verify the certificate chain and renewal status.",
    sslExpiryTelegramTemplate:
      "Monitor: {domain} ({url}) certificate expires soon\nTime: {checked_at_local}\nCertificate status: {message}\nOrganization: {organization}",
  },
  tr: {
    defaultEmailSubjectTemplate: "[Sentrovia] {domain} {event_state} durumunda ({status_code})",
    defaultEmailHeadlineTemplate: "{name} erişilemiyor",
    defaultEmailBodyTemplate:
      "Monitör: {domain}\nSiteyi kontrol et: {url}\nDurum: {status_code} - {status_label}\nHata nedeni: {failure_reason}\nKök neden: {rca_summary}\nDetay: {message}\nKesin hata zaman aşımı: {hard_timeout_ms} ms\nOrganizasyon: {organization}\n\n## Önerilen kontroller\n- {rca_details}",
    defaultTelegramTemplate:
      "Monitör: {domain} ({url}) şu anda {event_state}\nZaman: {checked_at_local}\nDurum: {status_code} - {status_label}\nKök neden: {rca_summary}\nDetay: {message}\nOrganizasyon: {organization}",
    slowResponseEmailSubjectTemplate: "[Sentrovia] {domain} yavaş yanıt veriyor ({latency_ms} ms)",
    slowResponseEmailHeadlineTemplate: "{name} yavaş yanıt veriyor",
    slowResponseEmailBodyTemplate:
      "Monitör: {domain}\nSiteyi kontrol et: {url}\nDetay: {message}\nYanıt süresi: {latency_ms} ms\nYavaşlık eşiği: {slow_threshold_ms} ms\nKesin hata zaman aşımı: {hard_timeout_ms} ms\nDurum: {status_code} - {status_label}\nOrganizasyon: {organization}\n\n## Önerilen kontroller\n- Kesin hata zaman aşımına ulaşmadan önce uygulama ve bağımlılık gecikmelerini inceleyin.",
    slowResponseTelegramTemplate:
      "Monitör: {domain} ({url}) erişilebilir ancak yavaş yanıt veriyor\nZaman: {checked_at_local}\nYanıt süresi: {latency_ms} ms\nYavaşlık eşiği: {slow_threshold_ms} ms\nKesin hata zaman aşımı: {hard_timeout_ms} ms\nDurum: {status_code} - {status_label}\nOrganizasyon: {organization}",
    recoveryEmailSubjectTemplate: "[Sentrovia] {domain} düzeldi ({status_code})",
    recoveryEmailHeadlineTemplate: "{name} yeniden erişilebilir",
    recoveryEmailBodyTemplate:
      "Monitör: {domain}\nSiteyi kontrol et: {url}\nDetay: {message}\nİyileşme öncesi kesinti: {downtime_duration}\nİyileşme zamanı: {checked_at_local}\nDurum: {status_code} - {status_label}\nOrganizasyon: {organization}",
    recoveryTelegramTemplate:
      "Monitör: {domain} ({url}) düzeldi\nZaman: {checked_at_local}\nDurum: {status_code} - {status_label}\nKök neden: {rca_summary}\nDetay: {message}\nOrganizasyon: {organization}",
    prolongedDowntimeEmailSubjectTemplate: "[Sentrovia] {domain} {downtime_duration} süredir DOWN",
    prolongedDowntimeEmailHeadlineTemplate: "{name} hâlâ erişilemiyor",
    prolongedDowntimeEmailBodyTemplate:
      "Monitör: {domain}\nSiteyi kontrol et: {url}\nDetay: {message}\nMevcut kesinti süresi: {downtime_duration}\nBaşlangıç: {downtime_started_at_local}\nDurum: {status_code} - {status_label}\nKök neden: {rca_summary}\nOrganizasyon: {organization}\n\n## Önerilen kontroller\n- {rca_details}",
    prolongedDowntimeTelegramTemplate:
      "Monitör: {domain} ({url}) {downtime_duration} süredir hala DOWN\nBaşlangıç: {downtime_started_at_local}\nSon kontrol: {checked_at_local}\nDurum: {status_code} - {status_label}\nKök neden: {rca_summary}\nDetay: {message}\nOrganizasyon: {organization}",
    sslExpiryEmailSubjectTemplate: "[Sentrovia] {domain} SSL SÜRESİ DOLUYOR",
    sslExpiryEmailHeadlineTemplate: "{name} sertifikasının süresi yaklaşıyor",
    sslExpiryEmailBodyTemplate:
      "Sertifika durumu: {message}\nKontrol zamanı: {checked_at_local}\nOrganizasyon: {organization}\n\n## Önerilen kontroller\n- Siteyi açarak sertifika zincirini ve yenileme durumunu doğrulayın.",
    sslExpiryTelegramTemplate:
      "Monitör: {domain} ({url}) sertifikasının süresi yaklaşıyor\nZaman: {checked_at_local}\nSertifika durumu: {message}\nOrganizasyon: {organization}",
  },
} as const;

export const DEFAULT_NOTIFICATION_TEMPLATES = DEFAULT_NOTIFICATION_TEMPLATES_BY_LANGUAGE.en;

export function getDefaultNotificationTemplates(language: NotificationLanguage) {
  return DEFAULT_NOTIFICATION_TEMPLATES_BY_LANGUAGE[language];
}

export const DEFAULT_SETTINGS: SettingsPayload = {
  profile: {
    firstName: "",
    lastName: "",
    email: "",
    role: "operator",
    department: "",
    username: "",
    organization: "",
    jobTitle: "",
    phone: "",
  },
  notifications: {
    defaultMonitorNotificationPref: "both",
    notificationLanguage: "en",
    notifyOnDown: true,
    notifyOnRecovery: true,
    notifyOnStatusChange: false,
    notifyOnLatency: true,
    prolongedDowntimeEnabled: true,
    prolongedDowntimeMinutes: 180,
    alertDedupMinutes: 15,
    smtpHost: "",
    smtpPort: 587,
    smtpUsername: "",
    smtpPassword: "",
    smtpPasswordConfigured: false,
    smtpFromEmail: "",
    smtpDefaultToEmail: "",
    smtpSecure: false,
    smtpRequireTls: true,
    smtpInsecureSkipVerify: false,
    discordWebhookUrl: "",
    discordEnabled: false,
    notificationEmailBrandName: "Sentrovia Monitoring",
    notificationEmailFooterText: "",
    defaultTelegramBotToken: "",
    defaultTelegramBotTokenConfigured: false,
    defaultTelegramChatId: "",
    ...DEFAULT_NOTIFICATION_TEMPLATES,
    statusCodeAlertCodes: "500,502,503,504",
    savedEmailRecipients: [],
  },
  monitoring: {
    interval: "5m",
    timeout: 60000,
    slowResponseThresholdMs: null,
    retries: 3,
    batchSize: 20,
    method: "GET",
    responseMaxLength: 1024,
    maxRedirects: 5,
    checkSslExpiry: false,
    ignoreSslErrors: false,
    cacheBuster: false,
    saveErrorPages: false,
    saveSuccessPages: false,
  },
  appearance: {
    reduceMotion: false,
    compactDensity: false,
    sidebarAccent: "emerald",
    dashboardLandingPage: "dashboard",
    dashboardWidgets: ["summary", "system", "monitor-focus", "company-health", "recent-events", "delivery"],
    dashboardCompanyId: "",
    dashboardFocus: "all",
    showOutageBanner: true,
    showChartsSection: true,
    highContrastSurfaces: false,
    timeZone: "Europe/Istanbul",
    use24HourClock: true,
  },
  publicStatus: {
    enabled: false,
    slug: "",
    title: "",
    summary: "",
    companyId: "",
  },
  data: {
    retentionDays: 90,
    deliveryRetentionDays: 90,
    autoBackupEnabled: false,
    backupWindow: "03:00",
    backupRetentionCount: 7,
    lastBackupStatus: null,
    lastBackupError: null,
    lastAutomaticBackupAt: null,
    eventRetentionDays: 30,
    lastBackupAt: null,
  },
};
