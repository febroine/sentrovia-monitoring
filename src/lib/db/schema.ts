import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    firstName: varchar("first_name", { length: 80 }).notNull(),
    lastName: varchar("last_name", { length: 80 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    department: varchar("department", { length: 120 }),
    username: varchar("username", { length: 80 }),
    organization: varchar("organization", { length: 160 }),
    jobTitle: varchar("job_title", { length: 120 }),
    phone: varchar("phone", { length: 40 }),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_username_unique").on(table.username),
  ]
);

export const userSettings = pgTable(
  "user_settings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    notifyOnDown: boolean("notify_on_down").default(true).notNull(),
    notifyOnRecovery: boolean("notify_on_recovery").default(true).notNull(),
    notifyOnLatency: boolean("notify_on_latency").default(true).notNull(),
    notifyOnSslExpiry: boolean("notify_on_ssl_expiry").default(true).notNull(),
    notifyOnStatusChange: boolean("notify_on_status_change").default(false).notNull(),
    prolongedDowntimeEnabled: boolean("prolonged_downtime_enabled").default(true).notNull(),
    prolongedDowntimeMinutes: integer("prolonged_downtime_minutes").default(180).notNull(),
    alertDedupMinutes: integer("alert_dedup_minutes").default(15).notNull(),
    smtpHost: varchar("smtp_host", { length: 255 }),
    smtpPort: integer("smtp_port").default(587).notNull(),
    smtpUsername: varchar("smtp_username", { length: 255 }),
    smtpPasswordEncrypted: text("smtp_password_encrypted"),
    smtpFromEmail: varchar("smtp_from_email", { length: 255 }),
    smtpDefaultToEmail: varchar("smtp_default_to_email", { length: 255 }),
    smtpSecure: boolean("smtp_secure").default(true).notNull(),
    smtpRequireTls: boolean("smtp_require_tls").default(true).notNull(),
    smtpInsecureSkipVerify: boolean("smtp_insecure_skip_verify").default(true).notNull(),
    slackWebhookUrl: varchar("slack_webhook_url", { length: 500 }),
    slackEnabled: boolean("slack_enabled").default(false).notNull(),
    discordWebhookUrl: varchar("discord_webhook_url", { length: 500 }),
    discordEnabled: boolean("discord_enabled").default(false).notNull(),
    defaultEmailSubjectTemplate: text("default_email_subject_template"),
    defaultEmailBodyTemplate: text("default_email_body_template"),
    defaultTelegramTemplate: text("default_telegram_template"),
    prolongedDowntimeEmailSubjectTemplate: text("prolonged_downtime_email_subject_template"),
    prolongedDowntimeEmailBodyTemplate: text("prolonged_downtime_email_body_template"),
    prolongedDowntimeTelegramTemplate: text("prolonged_downtime_telegram_template"),
    statusCodeAlertCodes: varchar("status_code_alert_codes", { length: 500 }),
    savedEmailRecipients: text("saved_email_recipients")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    monitoringInterval: varchar("monitoring_interval", { length: 16 }).default("5m").notNull(),
    monitoringTimeout: integer("monitoring_timeout").default(5000).notNull(),
    monitoringRetries: integer("monitoring_retries").default(3).notNull(),
    monitoringMethod: varchar("monitoring_method", { length: 10 }).default("GET").notNull(),
    monitoringRegion: varchar("monitoring_region", { length: 64 }).default("eu-central").notNull(),
    monitoringMaintenanceWindow: varchar("monitoring_maintenance_window", { length: 120 }),
    monitoringResponseMaxLength: integer("monitoring_response_max_length").default(1024).notNull(),
    monitoringMaxRedirects: integer("monitoring_max_redirects").default(5).notNull(),
    monitoringIgnoreSslErrors: boolean("monitoring_ignore_ssl_errors").default(true).notNull(),
    monitoringBatchSize: integer("monitoring_batch_size").default(20).notNull(),
    reduceMotion: boolean("reduce_motion").default(false).notNull(),
    compactDensity: boolean("compact_density").default(false).notNull(),
    sidebarAccent: varchar("sidebar_accent", { length: 24 }).default("emerald").notNull(),
    dashboardLandingPage: varchar("dashboard_landing_page", { length: 32 }).default("dashboard").notNull(),
    showIncidentBanner: boolean("show_incident_banner").default(true).notNull(),
    showChartsSection: boolean("show_charts_section").default(true).notNull(),
    appUpdateRepo: varchar("app_update_repo", { length: 255 }),
    appUpdateBranch: varchar("app_update_branch", { length: 120 }),
    enableInPlaceUpdates: boolean("enable_in_place_updates").default(true).notNull(),
    dataRetentionDays: integer("data_retention_days").default(90).notNull(),
    autoBackupEnabled: boolean("auto_backup_enabled").default(true).notNull(),
    backupWindow: varchar("backup_window", { length: 32 }).default("03:00").notNull(),
    eventRetentionDays: integer("event_retention_days").default(30).notNull(),
    lastBackupAt: timestamp("last_backup_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("user_settings_user_id_unique").on(table.userId)]
);

export const companies = pgTable("companies", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  website: varchar("website", { length: 255 }),
  email: varchar("email", { length: 255 }),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const monitors = pgTable("monitors", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  monitorType: varchar("monitor_type", { length: 24 }).default("http").notNull(),
  url: text("url").notNull(),
  companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
  company: varchar("company", { length: 160 }),
  status: varchar("status", { length: 16 }).default("pending").notNull(),
  statusCode: integer("status_code"),
  uptime: varchar("uptime", { length: 32 }).default("--").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  sslExpiresAt: timestamp("ssl_expires_at", { withTimezone: true }),
  lastErrorMessage: text("last_error_message"),
  consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
  verificationMode: boolean("verification_mode").default(false).notNull(),
  verificationFailureCount: integer("verification_failure_count").default(0).notNull(),
  latencyMs: integer("latency_ms"),
  notificationPref: varchar("notification_pref", { length: 16 }).default("none").notNull(),
  notifEmail: varchar("notif_email", { length: 255 }),
  telegramBotToken: text("telegram_bot_token"),
  telegramChatId: varchar("telegram_chat_id", { length: 120 }),
  heartbeatToken: text("heartbeat_token"),
  heartbeatLastReceivedAt: timestamp("heartbeat_last_received_at", { withTimezone: true }),
  intervalValue: integer("interval_value").default(5).notNull(),
  intervalUnit: varchar("interval_unit", { length: 8 }).default("dk").notNull(),
  timeout: integer("timeout").default(5000).notNull(),
  retries: integer("retries").default(3).notNull(),
  method: varchar("method", { length: 10 }).default("GET").notNull(),
  databaseSsl: boolean("database_ssl").default(true).notNull(),
  databasePasswordEncrypted: text("database_password_encrypted"),
  keywordQuery: text("keyword_query"),
  keywordInvert: boolean("keyword_invert").default(false).notNull(),
  jsonPath: varchar("json_path", { length: 255 }),
  jsonExpectedValue: text("json_expected_value"),
  jsonMatchMode: varchar("json_match_mode", { length: 16 }).default("equals").notNull(),
  tags: text("tags")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  renotifyCount: integer("renotify_count"),
  maxRedirects: integer("max_redirects").default(5).notNull(),
  ipFamily: varchar("ip_family", { length: 10 }).default("auto").notNull(),
  checkSslExpiry: boolean("check_ssl_expiry").default(false).notNull(),
  ignoreSslErrors: boolean("ignore_ssl_errors").default(false).notNull(),
  cacheBuster: boolean("cache_buster").default(false).notNull(),
  saveErrorPages: boolean("save_error_pages").default(false).notNull(),
  saveSuccessPages: boolean("save_success_pages").default(false).notNull(),
  responseMaxLength: integer("response_max_length").default(1024).notNull(),
  telegramTemplate: text("telegram_template"),
  emailSubject: text("email_subject"),
  emailBody: text("email_body"),
  sendIncidentScreenshot: boolean("send_incident_screenshot").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const monitorEvents = pgTable("monitor_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  monitorId: text("monitor_id")
    .notNull()
    .references(() => monitors.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 32 }).notNull(),
  status: varchar("status", { length: 16 }),
  statusCode: integer("status_code"),
  latencyMs: integer("latency_ms"),
  message: text("message"),
  rcaType: varchar("rca_type", { length: 32 }),
  rcaTitle: varchar("rca_title", { length: 160 }),
  rcaSummary: text("rca_summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const monitorChecks = pgTable("monitor_checks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  monitorId: text("monitor_id")
    .notNull()
    .references(() => monitors.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).notNull(),
  statusCode: integer("status_code"),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const monitorIncidents = pgTable("monitor_incidents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  monitorId: text("monitor_id")
    .notNull()
    .references(() => monitors.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).default("open").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  statusCode: integer("status_code"),
  errorMessage: text("error_message"),
  notes: text("notes").default("").notNull(),
  postmortem: text("postmortem").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const logFilterPresets = pgTable("log_filter_presets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  filtersJson: text("filters_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: varchar("url", { length: 500 }).notNull(),
    secretEncrypted: text("secret_encrypted"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("webhook_endpoints_user_id_unique").on(table.userId)]
);

export const deliveryEvents = pgTable("delivery_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  channel: varchar("channel", { length: 16 }).notNull(),
  kind: varchar("kind", { length: 24 }).notNull(),
  destination: varchar("destination", { length: 500 }).notNull(),
  payloadJson: text("payload_json").notNull(),
  status: varchar("status", { length: 16 }).default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  responseCode: integer("response_code"),
  errorMessage: text("error_message"),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workerState = pgTable("worker_state", {
  id: text("id").primaryKey(),
  desiredState: varchar("desired_state", { length: 16 }).default("stopped").notNull(),
  running: boolean("running").default(false).notNull(),
  checkedCount: integer("checked_count").default(0).notNull(),
  lastCycleAt: timestamp("last_cycle_at", { withTimezone: true }),
  lastCycleDurationMs: integer("last_cycle_duration_ms"),
  lastCycleMonitorCount: integer("last_cycle_monitor_count").default(0).notNull(),
  lastCycleSuccessCount: integer("last_cycle_success_count").default(0).notNull(),
  lastCycleFailureCount: integer("last_cycle_failure_count").default(0).notNull(),
  lastCyclePendingCount: integer("last_cycle_pending_count").default(0).notNull(),
  lastCycleAverageLatencyMs: integer("last_cycle_average_latency_ms"),
  lastCycleBacklog: integer("last_cycle_backlog").default(0).notNull(),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  lastErrorMessage: text("last_error_message"),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  pid: integer("pid"),
  statusMessage: text("status_message"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workerCycleMetrics = pgTable("worker_cycle_metrics", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  cycleStartedAt: timestamp("cycle_started_at", { withTimezone: true }).notNull(),
  cycleFinishedAt: timestamp("cycle_finished_at", { withTimezone: true }).notNull(),
  durationMs: integer("duration_ms").notNull(),
  backlogAtStart: integer("backlog_at_start").default(0).notNull(),
  claimedMonitors: integer("claimed_monitors").default(0).notNull(),
  completedMonitors: integer("completed_monitors").default(0).notNull(),
  successCount: integer("success_count").default(0).notNull(),
  failureCount: integer("failure_count").default(0).notNull(),
  pendingCount: integer("pending_count").default(0).notNull(),
  averageLatencyMs: integer("average_latency_ms"),
  maxLatencyMs: integer("max_latency_ms"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reportSchedules = pgTable("report_schedules", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
  name: varchar("name", { length: 160 }).notNull(),
  scope: varchar("scope", { length: 24 }).default("global").notNull(),
  cadence: varchar("cadence", { length: 16 }).default("weekly").notNull(),
  recipientEmails: text("recipient_emails")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  isActive: boolean("is_active").default(true).notNull(),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
  lastStatus: varchar("last_status", { length: 16 }).default("idle").notNull(),
  lastErrorMessage: text("last_error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const maintenanceWindows = pgTable("maintenance_windows", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  timezone: varchar("timezone", { length: 64 }).default("Europe/Istanbul").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  suppressNotifications: boolean("suppress_notifications").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Monitor = typeof monitors.$inferSelect;
