export interface SettingsPayload {
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    role: "admin" | "member";
    department: string;
    username: string;
    organization: string;
    jobTitle: string;
    phone: string;
  };
  notifications: {
    notificationLanguage: NotificationLanguage;
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
    defaultEmailSubjectTemplate: string;
    defaultEmailBodyTemplate: string;
    defaultTelegramTemplate: string;
    recoveryEmailSubjectTemplate: string;
    recoveryEmailBodyTemplate: string;
    recoveryTelegramTemplate: string;
    prolongedDowntimeEmailSubjectTemplate: string;
    prolongedDowntimeEmailBodyTemplate: string;
    prolongedDowntimeTelegramTemplate: string;
    statusCodeAlertCodes: string;
    savedEmailRecipients: string[];
  };
  monitoring: {
    interval: string;
    timeout: number;
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
    showIncidentBanner: boolean;
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
  };
  data: {
    retentionDays: number;
    autoBackupEnabled: boolean;
    backupWindow: string;
    eventRetentionDays: number;
    lastBackupAt: string | null;
  };
}

export type NotificationLanguage = "en" | "tr";

export const DEFAULT_NOTIFICATION_TEMPLATES_BY_LANGUAGE = {
  en: {
    defaultEmailSubjectTemplate: "[Sentrovia] {domain} is {event_state} ({status_code})",
    defaultEmailBodyTemplate:
      "Monitor: {domain} ({url_link}) is now {event_state}\nTime: {checked_at_local}\nStatus: {status_code} - {status_label}\nRoot cause: {rca_summary}\nDetails: {message}\nOrganization: {organization}",
    defaultTelegramTemplate:
      "Monitor: {domain} ({url}) is now {event_state}\nTime: {checked_at_local}\nStatus: {status_code} - {status_label}\nRoot cause: {rca_summary}\nDetails: {message}\nOrganization: {organization}",
    recoveryEmailSubjectTemplate: "[Sentrovia] {domain} recovered ({status_code})",
    recoveryEmailBodyTemplate:
      "Monitor: {domain} ({url_link}) recovered\nTime: {checked_at_local}\nStatus: {status_code} - {status_label}\nRoot cause: {rca_summary}\nDetails: {message}\nOrganization: {organization}",
    recoveryTelegramTemplate:
      "Monitor: {domain} ({url}) recovered\nTime: {checked_at_local}\nStatus: {status_code} - {status_label}\nRoot cause: {rca_summary}\nDetails: {message}\nOrganization: {organization}",
    prolongedDowntimeEmailSubjectTemplate: "[Sentrovia] {domain} has been DOWN for {downtime_duration}",
    prolongedDowntimeEmailBodyTemplate:
      "Monitor: {domain} ({url_link}) has been down for {downtime_duration}\nStarted at: {downtime_started_at_local}\nLast checked: {checked_at_local}\nStatus: {status_code} - {status_label}\nRoot cause: {rca_summary}\nDetails: {message}\nOrganization: {organization}",
    prolongedDowntimeTelegramTemplate:
      "Monitor: {domain} ({url}) is still DOWN for {downtime_duration}\nStarted at: {downtime_started_at_local}\nLast checked: {checked_at_local}\nStatus: {status_code} - {status_label}\nRoot cause: {rca_summary}\nDetails: {message}\nOrganization: {organization}",
  },
  tr: {
    defaultEmailSubjectTemplate: "[Sentrovia] {domain} {event_state} durumunda ({status_code})",
    defaultEmailBodyTemplate:
      "Monitör: {domain} ({url_link}) şu anda {event_state}\nZaman: {checked_at_local}\nDurum: {status_code} - {status_label}\nKök neden: {rca_summary}\nDetay: {message}\nOrganizasyon: {organization}",
    defaultTelegramTemplate:
      "Monitör: {domain} ({url}) şu anda {event_state}\nZaman: {checked_at_local}\nDurum: {status_code} - {status_label}\nKök neden: {rca_summary}\nDetay: {message}\nOrganizasyon: {organization}",
    recoveryEmailSubjectTemplate: "[Sentrovia] {domain} düzeldi ({status_code})",
    recoveryEmailBodyTemplate:
      "Monitör: {domain} ({url_link}) düzeldi\nZaman: {checked_at_local}\nDurum: {status_code} - {status_label}\nKök neden: {rca_summary}\nDetay: {message}\nOrganizasyon: {organization}",
    recoveryTelegramTemplate:
      "Monitör: {domain} ({url}) düzeldi\nZaman: {checked_at_local}\nDurum: {status_code} - {status_label}\nKök neden: {rca_summary}\nDetay: {message}\nOrganizasyon: {organization}",
    prolongedDowntimeEmailSubjectTemplate: "[Sentrovia] {domain} {downtime_duration} süredir DOWN",
    prolongedDowntimeEmailBodyTemplate:
      "Monitör: {domain} ({url_link}) {downtime_duration} süredir down\nBaşlangıç: {downtime_started_at_local}\nSon kontrol: {checked_at_local}\nDurum: {status_code} - {status_label}\nKök neden: {rca_summary}\nDetay: {message}\nOrganizasyon: {organization}",
    prolongedDowntimeTelegramTemplate:
      "Monitör: {domain} ({url}) {downtime_duration} süredir hala DOWN\nBaşlangıç: {downtime_started_at_local}\nSon kontrol: {checked_at_local}\nDurum: {status_code} - {status_label}\nKök neden: {rca_summary}\nDetay: {message}\nOrganizasyon: {organization}",
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
    role: "member",
    department: "",
    username: "",
    organization: "",
    jobTitle: "",
    phone: "",
  },
  notifications: {
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
    smtpRequireTls: false,
    smtpInsecureSkipVerify: true,
    discordWebhookUrl: "",
    discordEnabled: false,
    ...DEFAULT_NOTIFICATION_TEMPLATES,
    statusCodeAlertCodes: "500,502,503,504",
    savedEmailRecipients: [],
  },
  monitoring: {
    interval: "5m",
    timeout: 60000,
    retries: 3,
    batchSize: 20,
    method: "GET",
    responseMaxLength: 1024,
    maxRedirects: 5,
    checkSslExpiry: false,
    ignoreSslErrors: true,
    cacheBuster: false,
    saveErrorPages: false,
    saveSuccessPages: false,
  },
  appearance: {
    reduceMotion: false,
    compactDensity: false,
    sidebarAccent: "emerald",
    dashboardLandingPage: "dashboard",
    showIncidentBanner: true,
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
  },
  data: {
    retentionDays: 90,
    autoBackupEnabled: true,
    backupWindow: "03:00",
    eventRetentionDays: 30,
    lastBackupAt: null,
  },
};
