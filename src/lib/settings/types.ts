export interface SettingsPayload {
  maintenanceWindows: Array<{
    id: string;
    name: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    isActive: boolean;
    suppressNotifications: boolean;
  }>;
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    department: string;
    username: string;
    organization: string;
    jobTitle: string;
    phone: string;
  };
  notifications: {
    notifyOnDown: boolean;
    notifyOnRecovery: boolean;
    notifyOnLatency: boolean;
    notifyOnSslExpiry: boolean;
    notifyOnStatusChange: boolean;
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
    slackWebhookUrl: string;
    slackEnabled: boolean;
    discordWebhookUrl: string;
    discordEnabled: boolean;
    defaultEmailSubjectTemplate: string;
    defaultEmailBodyTemplate: string;
    defaultTelegramTemplate: string;
    statusCodeAlertCodes: string;
    savedEmailRecipients: string[];
  };
  monitoring: {
    interval: string;
    timeout: number;
    retries: number;
    batchSize: number;
    method: string;
    region: string;
    maintenanceWindow: string;
    responseMaxLength: number;
    maxRedirects: number;
    ignoreSslErrors: boolean;
  };
  appearance: {
    reduceMotion: boolean;
    compactDensity: boolean;
    sidebarAccent: string;
    dashboardLandingPage: string;
    showIncidentBanner: boolean;
    showChartsSection: boolean;
  };
  data: {
    retentionDays: number;
    autoBackupEnabled: boolean;
    backupWindow: string;
    eventRetentionDays: number;
  };
}

export const DEFAULT_SETTINGS: SettingsPayload = {
  maintenanceWindows: [],
  profile: {
    firstName: "",
    lastName: "",
    email: "",
    department: "",
    username: "",
    organization: "",
    jobTitle: "",
    phone: "",
  },
  notifications: {
    notifyOnDown: true,
    notifyOnRecovery: true,
    notifyOnLatency: true,
    notifyOnSslExpiry: true,
    notifyOnStatusChange: false,
    smtpHost: "",
    smtpPort: 587,
    smtpUsername: "",
    smtpPassword: "",
    smtpPasswordConfigured: false,
    smtpFromEmail: "",
    smtpDefaultToEmail: "",
    smtpSecure: true,
    smtpRequireTls: true,
    smtpInsecureSkipVerify: true,
    slackWebhookUrl: "",
    slackEnabled: false,
    discordWebhookUrl: "",
    discordEnabled: false,
    defaultEmailSubjectTemplate: "[Sentrovia] {domain} is {event_state} ({status_code})",
    defaultEmailBodyTemplate:
      "Monitor: {domain} ({url_link}) is now {event_state}\nTime: {checked_at_local}\nStatus: {status_code} - {status_label}\nRoot cause: {rca_summary}\nDetails: {message}\nOrganization: {organization}",
    defaultTelegramTemplate:
      "{domain} ({url}) is now {event_state}\n\nTIME: {checked_at_local}\n\nSTATUS: {status_code} - {status_label}\nROOT CAUSE: {rca_summary}",
    statusCodeAlertCodes: "500,502,503,504",
    savedEmailRecipients: [],
  },
  monitoring: {
    interval: "5m",
    timeout: 5000,
    retries: 3,
    batchSize: 20,
    method: "GET",
    region: "eu-central",
    maintenanceWindow: "",
    responseMaxLength: 1024,
    maxRedirects: 5,
    ignoreSslErrors: true,
  },
  appearance: {
    reduceMotion: false,
    compactDensity: false,
    sidebarAccent: "emerald",
    dashboardLandingPage: "dashboard",
    showIncidentBanner: true,
    showChartsSection: true,
  },
  data: {
    retentionDays: 90,
    autoBackupEnabled: true,
    backupWindow: "03:00",
    eventRetentionDays: 30,
  },
};
