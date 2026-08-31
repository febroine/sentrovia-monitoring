import { sql } from "drizzle-orm";
import {
  boolean,
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const manualMigrations = pgTable("sentrovia_manual_migrations", {
  filename: text("filename").primaryKey(),
  checksum: text("checksum").notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
});

export const securityMigrations = pgTable("sentrovia_security_migrations", {
  id: text("id").primaryKey(),
  completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
});

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
    role: varchar("role", { length: 16 }).default("operator").notNull(),
    sessionVersion: integer("session_version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(sql`lower(${table.email})`),
    uniqueIndex("users_username_unique").on(sql`lower(${table.username})`),
  ]
);

export const workspaces = pgTable("workspaces", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 160 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).default("operator").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workspace_members_workspace_user_unique").on(table.workspaceId, table.userId),
    index("workspace_members_user_created_idx").on(table.userId, table.createdAt),
    index("workspace_members_workspace_role_idx").on(table.workspaceId, table.role),
    check(
      "workspace_members_role_check",
      sql`${table.role} in ('admin', 'manager', 'operator', 'viewer')`
    ),
  ]
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorLabel: varchar("actor_label", { length: 255 }).notNull(),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: text("entity_id"),
    entityLabel: varchar("entity_label", { length: 255 }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_events_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("audit_events_user_created_idx").on(table.userId, table.createdAt),
    index("audit_events_actor_created_idx").on(table.actorUserId, table.createdAt),
  ]
);

export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    rateKey: varchar("rate_key", { length: 64 }).primaryKey(),
    action: varchar("action", { length: 32 }).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("auth_rate_limits_updated_idx").on(table.updatedAt)]
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
    notificationLanguage: varchar("notification_language", { length: 8 }).default("en").notNull(),
    notifyOnDown: boolean("notify_on_down").default(true).notNull(),
    notifyOnRecovery: boolean("notify_on_recovery").default(true).notNull(),
    notifyOnStatusChange: boolean("notify_on_status_change").default(false).notNull(),
    notifyOnLatency: boolean("notify_on_latency").default(true).notNull(),
    prolongedDowntimeEnabled: boolean("prolonged_downtime_enabled").default(true).notNull(),
    prolongedDowntimeMinutes: integer("prolonged_downtime_minutes").default(180).notNull(),
    alertDedupMinutes: integer("alert_dedup_minutes").default(15).notNull(),
    smtpHost: varchar("smtp_host", { length: 255 }),
    smtpPort: integer("smtp_port").default(587).notNull(),
    smtpUsername: varchar("smtp_username", { length: 255 }),
    smtpPasswordEncrypted: text("smtp_password_encrypted"),
    smtpFromEmail: varchar("smtp_from_email", { length: 255 }),
    smtpDefaultToEmail: varchar("smtp_default_to_email", { length: 255 }),
    smtpSecure: boolean("smtp_secure").default(false).notNull(),
    smtpRequireTls: boolean("smtp_require_tls").default(true).notNull(),
    smtpInsecureSkipVerify: boolean("smtp_insecure_skip_verify").default(false).notNull(),
    slackWebhookUrl: varchar("slack_webhook_url", { length: 500 }),
    slackEnabled: boolean("slack_enabled").default(false).notNull(),
    discordWebhookUrl: text("discord_webhook_url"),
    discordEnabled: boolean("discord_enabled").default(false).notNull(),
    notificationEmailBrandName: varchar("notification_email_brand_name", { length: 160 }),
    notificationEmailFooterText: varchar("notification_email_footer_text", { length: 240 }),
    defaultEmailSubjectTemplate: text("default_email_subject_template"),
    defaultEmailBodyTemplate: text("default_email_body_template"),
    defaultTelegramTemplate: text("default_telegram_template"),
    slowResponseEmailSubjectTemplate: text("slow_response_email_subject_template"),
    slowResponseEmailBodyTemplate: text("slow_response_email_body_template"),
    slowResponseTelegramTemplate: text("slow_response_telegram_template"),
    defaultTelegramBotTokenEncrypted: text("default_telegram_bot_token_encrypted"),
    defaultTelegramChatId: varchar("default_telegram_chat_id", { length: 120 }),
    recoveryEmailSubjectTemplate: text("recovery_email_subject_template"),
    recoveryEmailBodyTemplate: text("recovery_email_body_template"),
    recoveryTelegramTemplate: text("recovery_telegram_template"),
    prolongedDowntimeEmailSubjectTemplate: text("prolonged_downtime_email_subject_template"),
    prolongedDowntimeEmailBodyTemplate: text("prolonged_downtime_email_body_template"),
    prolongedDowntimeTelegramTemplate: text("prolonged_downtime_telegram_template"),
    statusCodeAlertCodes: varchar("status_code_alert_codes", { length: 500 }),
    savedEmailRecipients: text("saved_email_recipients")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    monitoringInterval: varchar("monitoring_interval", { length: 16 }).default("5m").notNull(),
    monitoringTimeout: integer("monitoring_timeout").default(60000).notNull(),
    monitoringSlowResponseThresholdMs: integer("monitoring_slow_response_threshold_ms"),
    monitoringRetries: integer("monitoring_retries").default(3).notNull(),
    monitoringMethod: varchar("monitoring_method", { length: 10 }).default("GET").notNull(),
    monitoringResponseMaxLength: integer("monitoring_response_max_length").default(1024).notNull(),
    monitoringMaxRedirects: integer("monitoring_max_redirects").default(5).notNull(),
    monitoringCheckSslExpiry: boolean("monitoring_check_ssl_expiry").default(false).notNull(),
    monitoringIgnoreSslErrors: boolean("monitoring_ignore_ssl_errors").default(false).notNull(),
    monitoringCacheBuster: boolean("monitoring_cache_buster").default(false).notNull(),
    monitoringSaveErrorPages: boolean("monitoring_save_error_pages").default(false).notNull(),
    monitoringSaveSuccessPages: boolean("monitoring_save_success_pages").default(false).notNull(),
    monitoringBatchSize: integer("monitoring_batch_size").default(20).notNull(),
    reduceMotion: boolean("reduce_motion").default(false).notNull(),
    compactDensity: boolean("compact_density").default(false).notNull(),
    sidebarAccent: varchar("sidebar_accent", { length: 24 }).default("emerald").notNull(),
    dashboardLandingPage: varchar("dashboard_landing_page", { length: 32 }).default("dashboard").notNull(),
    dashboardWidgets: text("dashboard_widgets"),
    dashboardCompanyId: text("dashboard_company_id"),
    dashboardFocus: varchar("dashboard_focus", { length: 16 }).default("all").notNull(),
    showOutageBanner: boolean("show_outage_banner").default(true).notNull(),
    showChartsSection: boolean("show_charts_section").default(true).notNull(),
    highContrastSurfaces: boolean("high_contrast_surfaces").default(false).notNull(),
    use24HourClock: boolean("use_24_hour_clock").default(true).notNull(),
    timeZone: varchar("time_zone", { length: 100 }).default("Europe/Istanbul").notNull(),
    publicStatusEnabled: boolean("public_status_enabled").default(false).notNull(),
    publicStatusSlug: varchar("public_status_slug", { length: 120 }),
    publicStatusTitle: varchar("public_status_title", { length: 160 }),
    publicStatusSummary: text("public_status_summary"),
    publicStatusCompanyId: text("public_status_company_id"),
    dataRetentionDays: integer("data_retention_days").default(90).notNull(),
    deliveryRetentionDays: integer("delivery_retention_days").default(90).notNull(),
    autoBackupEnabled: boolean("auto_backup_enabled").default(false).notNull(),
    backupWindow: varchar("backup_window", { length: 32 }).default("03:00").notNull(),
    backupRetentionCount: integer("backup_retention_count").default(7).notNull(),
    lastBackupStatus: varchar("last_backup_status", { length: 16 }),
    lastBackupError: text("last_backup_error"),
    lastAutomaticBackupAt: timestamp("last_automatic_backup_at", { withTimezone: true }),
    eventRetentionDays: integer("event_retention_days").default(30).notNull(),
    lastBackupAt: timestamp("last_backup_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_settings_user_id_unique").on(table.userId),
    uniqueIndex("user_settings_public_status_slug_unique").on(table.publicStatusSlug),
    index("user_settings_public_status_company_id_idx").on(table.publicStatusCompanyId),
  ]
);

export const automaticBackupRuns = pgTable(
  "automatic_backup_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    scheduledDate: varchar("scheduled_date", { length: 10 }).notNull(),
    status: varchar("status", { length: 16 }).default("running").notNull(),
    attempts: integer("attempts").default(1).notNull(),
    fileName: varchar("file_name", { length: 255 }),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("automatic_backup_runs_workspace_updated_idx").on(table.workspaceId, table.updatedAt),
    uniqueIndex("automatic_backup_runs_scheduled_date_unique").on(table.scheduledDate),
    index("automatic_backup_runs_status_updated_idx").on(table.status, table.updatedAt),
  ]
);

export const companies = pgTable(
  "companies",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    website: varchar("website", { length: 255 }),
    email: varchar("email", { length: 255 }),
    description: text("description"),
    notificationEmailRecipients: text("notification_email_recipients")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    telegramBotTokenEncrypted: text("telegram_bot_token_encrypted"),
    telegramChatId: varchar("telegram_chat_id", { length: 120 }),
    isActive: boolean("is_active").default(true).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedWasActive: boolean("deleted_was_active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("companies_workspace_deleted_at_idx").on(table.workspaceId, table.deletedAt),
    uniqueIndex("companies_user_normalized_name_unique").on(
      table.userId,
      sql`lower(btrim(${table.name}))`
    ),
    index("companies_user_deleted_at_idx").on(table.userId, table.deletedAt),
  ]
);

export const publicStatusPages = pgTable(
  "public_status_pages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 120 }).notNull(),
    title: varchar("title", { length: 160 }),
    summary: text("summary"),
    isEnabled: boolean("is_enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("public_status_pages_workspace_created_idx").on(table.workspaceId, table.createdAt),
    uniqueIndex("public_status_pages_slug_unique").on(table.slug),
    uniqueIndex("public_status_pages_user_company_unique")
      .on(table.userId, table.companyId)
      .where(sql`${table.companyId} is not null`),
    uniqueIndex("public_status_pages_user_workspace_unique")
      .on(table.userId)
      .where(sql`${table.companyId} is null`),
    index("public_status_pages_user_created_idx").on(table.userId, table.createdAt),
  ]
);

export const monitors = pgTable("monitors", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
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
  publishOnStatusPage: boolean("publish_on_status_page").default(false).notNull(),
  isFavorite: boolean("is_favorite").default(false).notNull(),
  isCritical: boolean("is_critical").default(false).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedWasActive: boolean("deleted_was_active"),
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
  notificationLanguage: varchar("notification_language", { length: 8 }).default("default").notNull(),
  notifEmail: text("notif_email"),
  telegramBotToken: text("telegram_bot_token"),
  telegramChatId: varchar("telegram_chat_id", { length: 120 }),
    heartbeatToken: text("heartbeat_token"),
    heartbeatTokenHash: varchar("heartbeat_token_hash", { length: 64 }),
  heartbeatLastReceivedAt: timestamp("heartbeat_last_received_at", { withTimezone: true }),
  intervalValue: integer("interval_value").default(5).notNull(),
  intervalUnit: varchar("interval_unit", { length: 8 }).default("dk").notNull(),
  timeout: integer("timeout").default(60000).notNull(),
  slowResponseThresholdMs: integer("slow_response_threshold_ms"),
  slowResponseAlertsEnabled: boolean("slow_response_alerts_enabled").default(true).notNull(),
  expectedStatusCodes: varchar("expected_status_codes", { length: 500 }),
  retries: integer("retries").default(3).notNull(),
  method: varchar("method", { length: 10 }).default("GET").notNull(),
  databaseSsl: boolean("database_ssl").default(true).notNull(),
  databaseTlsVerify: boolean("database_tls_verify").default(true).notNull(),
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
  slowResponseEmailSubject: text("slow_response_email_subject"),
  slowResponseEmailBody: text("slow_response_email_body"),
  slowResponseTelegramTemplate: text("slow_response_telegram_template"),
  sendOutageScreenshot: boolean("send_outage_screenshot").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("monitors_workspace_deleted_at_idx").on(table.workspaceId, table.deletedAt),
  index("monitors_user_deleted_at_idx").on(table.userId, table.deletedAt),
  index("monitors_user_favorite_critical_idx").on(table.userId, table.isFavorite, table.isCritical, table.status),
    uniqueIndex("monitors_heartbeat_token_hash_unique").on(table.heartbeatTokenHash),
]);

export const monitorEvents = pgTable("monitor_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
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
}, (table) => [
  index("monitor_events_workspace_created_idx").on(table.workspaceId, table.createdAt),
]);

export const monitorChecks = pgTable("monitor_checks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
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
}, (table) => [
  index("monitor_checks_workspace_created_idx").on(table.workspaceId, table.createdAt),
  index("monitor_checks_user_monitor_created_at_idx").on(
    table.userId,
    table.monitorId,
    table.createdAt
  ),
]);

export const monitorOutages = pgTable(
  "monitor_outages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("monitor_outages_workspace_created_idx").on(table.workspaceId, table.createdAt),
    uniqueIndex("monitor_outages_single_open_unique")
      .on(table.userId, table.monitorId)
      .where(sql`${table.status} = 'open' and ${table.resolvedAt} is null`),
  ]
);

export const logFilterPresets = pgTable(
  "log_filter_presets",
  {
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
  },
  (table) => [uniqueIndex("log_filter_presets_user_name_unique").on(table.userId, table.name)]
);

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secretEncrypted: text("secret_encrypted"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("webhook_endpoints_user_id_unique").on(table.userId),
    index("webhook_endpoints_workspace_created_idx").on(table.workspaceId, table.createdAt),
  ]
);

export const deliveryEvents = pgTable("delivery_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  monitorId: text("monitor_id").references(() => monitors.id, { onDelete: "set null" }),
  channel: varchar("channel", { length: 16 }).notNull(),
  kind: varchar("kind", { length: 24 }).notNull(),
  destination: text("destination").notNull(),
  payloadJson: text("payload_json").notNull(),
  status: varchar("status", { length: 16 }).default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  responseCode: integer("response_code"),
  errorMessage: text("error_message"),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  claimToken: text("claim_token"),
  claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("delivery_events_workspace_created_idx").on(table.workspaceId, table.createdAt),
  index("delivery_events_webhook_claim_due_idx").on(
    table.channel,
    table.status,
    table.claimExpiresAt,
    table.nextRetryAt,
    table.createdAt
  ),
  index("delivery_events_user_created_at_idx").on(table.userId, table.createdAt),
  index("delivery_events_queue_due_idx").on(table.status, table.nextRetryAt, table.claimExpiresAt, table.createdAt),
]);

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
  lastRetentionCleanupAt: timestamp("last_retention_cleanup_at", { withTimezone: true }),
  pid: integer("pid"),
  statusMessage: text("status_message"),
  connectivityStatus: varchar("connectivity_status", { length: 16 }).default("unknown").notNull(),
  connectivityCheckedAt: timestamp("connectivity_checked_at", { withTimezone: true }),
  connectivityMessage: text("connectivity_message"),
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
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
  name: varchar("name", { length: 160 }).notNull(),
  scope: varchar("scope", { length: 24 }).default("global").notNull(),
  cadence: varchar("cadence", { length: 16 }).default("weekly").notNull(),
  template: varchar("template", { length: 24 }).default("operations").notNull(),
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
  claimToken: text("claim_token"),
  claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
  deliveryDetailLevel: varchar("delivery_detail_level", { length: 16 }).default("standard").notNull(),
  includeOutageSummary: boolean("include_outage_summary").default(true).notNull(),
  includeMonitorBreakdown: boolean("include_monitor_breakdown").default(true).notNull(),
  emailSubjectTemplate: text("email_subject_template"),
  emailIntroTemplate: text("email_intro_template"),
  reportBrandName: varchar("report_brand_name", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("report_schedules_workspace_created_idx").on(table.workspaceId, table.createdAt),
  index("report_schedules_claim_due_idx").on(
    table.isActive,
    table.nextRunAt,
    table.lastStatus,
    table.claimExpiresAt
  ),
]);

export const monitorDiagnostics = pgTable(
  "monitor_diagnostics",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull(),
    failedPhase: varchar("failed_phase", { length: 24 }),
    failureCategory: varchar("failure_category", { length: 40 }),
    summary: text("summary").notNull(),
    dnsStatus: varchar("dns_status", { length: 16 }),
    resolvedIps: text("resolved_ips")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    tcpStatus: varchar("tcp_status", { length: 16 }),
    tlsStatus: varchar("tls_status", { length: 16 }),
    httpStatus: varchar("http_status", { length: 16 }),
    httpStatusCode: integer("http_status_code"),
    responseTimeMs: integer("response_time_ms"),
    timeoutMs: integer("timeout_ms").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("monitor_diagnostics_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("monitor_diagnostics_user_monitor_created_idx").on(table.userId, table.monitorId, table.createdAt),
    index("monitor_diagnostics_monitor_created_idx").on(table.monitorId, table.createdAt),
  ]
);

export const outageEvents = pgTable(
  "outage_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    outageId: text("outage_id").references(() => monitorOutages.id, { onDelete: "set null" }),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 48 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    detail: text("detail"),
    metadataJson: text("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("outage_events_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("outage_events_user_monitor_created_idx").on(table.userId, table.monitorId, table.createdAt),
    index("outage_events_outage_created_idx").on(table.outageId, table.createdAt),
  ]
);

export type Monitor = typeof monitors.$inferSelect;
