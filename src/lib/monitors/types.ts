export type SiteStatus = "up" | "down" | "pending";
export type NotificationPref = "email" | "telegram" | "both" | "none";
export type IntervalUnit = "sn" | "dk" | "sa";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export type IpFamily = "auto" | "ipv4" | "ipv6";
export type MonitorType = "http" | "port" | "postgres";

export interface MonitorRecord {
  id: string;
  name: string;
  monitorType: MonitorType;
  url: string;
  companyId: string | null;
  company: string | null;
  status: SiteStatus;
  statusCode: number | null;
  uptime: string;
  isActive: boolean;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  sslExpiresAt: string | null;
  lastErrorMessage: string | null;
  consecutiveFailures: number;
  verificationMode: boolean;
  verificationFailureCount: number;
  latencyMs: number | null;
  notificationPref: NotificationPref;
  notifEmail: string | null;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  timeout: number;
  retries: number;
  method: HttpMethod;
  tags: string[];
  renotifyCount: number | null;
  maxRedirects: number;
  ipFamily: IpFamily;
  databaseSsl: boolean;
  databasePasswordConfigured: boolean;
  checkSslExpiry: boolean;
  ignoreSslErrors: boolean;
  cacheBuster: boolean;
  saveErrorPages: boolean;
  saveSuccessPages: boolean;
  responseMaxLength: number;
  telegramTemplate: string | null;
  emailSubject: string | null;
  emailBody: string | null;
}

export interface MonitorHistoryPoint {
  id: string;
  monitorId: string;
  status: SiteStatus;
  statusCode: number | null;
  latencyMs: number | null;
  createdAt: string;
}

export interface CompanySlaReport {
  companyId: string;
  companyName: string;
  monitorCount: number;
  activeCount: number;
  averageLatencyMs: number;
  periods: Array<{
    label: string;
    uptimePct: number;
    incidents: number;
    totalChecks: number;
  }>;
  statusCodes: Array<{
    statusCode: number;
    count: number;
  }>;
}

export interface CompanyMonthlyReport {
  companyId: string;
  companyName: string;
  months: Array<{
    label: string;
    uptimePct: number;
    checks: number;
  }>;
}

export interface MonitorPayload {
  name: string;
  monitorType: MonitorType;
  url: string;
  portHost: string;
  portNumber: number;
  databaseHost: string;
  databasePort: number;
  databaseName: string;
  databaseUsername: string;
  databasePassword: string;
  databasePasswordConfigured: boolean;
  databaseSsl: boolean;
  companyId: string;
  company: string;
  notificationPref: NotificationPref;
  notifEmail: string;
  telegramBotToken: string;
  telegramChatId: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  timeout: number;
  retries: number;
  method: HttpMethod;
  tags: string[];
  renotifyCount: number | null;
  maxRedirects: number;
  ipFamily: IpFamily;
  checkSslExpiry: boolean;
  ignoreSslErrors: boolean;
  cacheBuster: boolean;
  saveErrorPages: boolean;
  saveSuccessPages: boolean;
  responseMaxLength: number;
  telegramTemplate: string;
  emailSubject: string;
  emailBody: string;
  isActive: boolean;
}

export interface WorkerStatus {
  desiredState: string;
  running: boolean;
  processAlive: boolean;
  checkedCount: number;
  lastCycleAt: string | null;
  heartbeatAt: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  pid: number | null;
  statusMessage: string | null;
}

export const DEFAULT_MONITOR_FORM: MonitorPayload = {
  name: "",
  monitorType: "http",
  url: "",
  portHost: "",
  portNumber: 443,
  databaseHost: "",
  databasePort: 5432,
  databaseName: "",
  databaseUsername: "",
  databasePassword: "",
  databasePasswordConfigured: false,
  databaseSsl: true,
  companyId: "",
  company: "",
  notificationPref: "email",
  notifEmail: "",
  telegramBotToken: "",
  telegramChatId: "",
  intervalValue: 5,
  intervalUnit: "dk",
  timeout: 5000,
  retries: 3,
  method: "GET",
  tags: [],
  renotifyCount: null,
  maxRedirects: 5,
  ipFamily: "auto",
  checkSslExpiry: false,
  ignoreSslErrors: true,
  cacheBuster: false,
  saveErrorPages: false,
  saveSuccessPages: false,
  responseMaxLength: 1024,
  telegramTemplate:
    "{domain} ({url}) is now {event_state}\n\nTIME: {checked_at_local}\n\nSTATUS: {status_code} - {status_label}\nROOT CAUSE: {rca_summary}",
  emailSubject: "[Sentrovia] {domain} is {event_state} ({status_code})",
  emailBody:
    "Monitor: {domain} ({url_link}) is now {event_state}\nTime: {checked_at_local}\nStatus: {status_code} - {status_label}\nRoot cause: {rca_summary}\nDetails: {message}\nOrganization: {organization}",
  isActive: true,
};
