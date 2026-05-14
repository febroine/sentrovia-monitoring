import { and, eq } from "drizzle-orm";
import { db, sql, type DatabaseExecutor } from "@/lib/db";
import { monitors, userSettings, users } from "@/lib/db/schema";
import { decryptValue, encryptValue } from "@/lib/security/encryption";
import { assertSafeWebhookUrl } from "@/lib/security/webhook-safety";
import type { SettingsInput } from "@/lib/settings/schemas";
import { DEFAULT_SETTINGS, type SettingsPayload } from "@/lib/settings/types";

type DatabaseErrorShape = {
  code?: string;
  message?: string;
  cause?: DatabaseErrorShape;
};

type TableName = "users" | "user_settings";
type ColumnName<T extends Record<string, string>> = T[keyof T];
type ExistingNotificationTemplates = {
  defaultEmailSubjectTemplate?: unknown;
  defaultEmailBodyTemplate?: unknown;
  defaultTelegramTemplate?: unknown;
};
type MonitorTemplateKey = "emailSubject" | "emailBody" | "telegramTemplate";
type SelectableColumn<T extends Record<string, string>> = {
  propertyName: keyof T & string;
  columnName: ColumnName<T>;
};

const USERS_COLUMN_MAP = {
  id: "id",
  firstName: "first_name",
  lastName: "last_name",
  email: "email",
  department: "department",
  username: "username",
  organization: "organization",
  jobTitle: "job_title",
  phone: "phone",
  updatedAt: "updated_at",
} as const;

const USER_SETTINGS_COLUMN_MAP = {
  id: "id",
  userId: "user_id",
  notifyOnDown: "notify_on_down",
  notifyOnRecovery: "notify_on_recovery",
  notifyOnStatusChange: "notify_on_status_change",
  prolongedDowntimeEnabled: "prolonged_downtime_enabled",
  prolongedDowntimeMinutes: "prolonged_downtime_minutes",
  alertDedupMinutes: "alert_dedup_minutes",
  smtpHost: "smtp_host",
  smtpPort: "smtp_port",
  smtpUsername: "smtp_username",
  smtpPasswordEncrypted: "smtp_password_encrypted",
  smtpFromEmail: "smtp_from_email",
  smtpDefaultToEmail: "smtp_default_to_email",
  smtpSecure: "smtp_secure",
  smtpRequireTls: "smtp_require_tls",
  smtpInsecureSkipVerify: "smtp_insecure_skip_verify",
  discordWebhookUrl: "discord_webhook_url",
  discordEnabled: "discord_enabled",
  defaultEmailSubjectTemplate: "default_email_subject_template",
  defaultEmailBodyTemplate: "default_email_body_template",
  defaultTelegramTemplate: "default_telegram_template",
  recoveryEmailSubjectTemplate: "recovery_email_subject_template",
  recoveryEmailBodyTemplate: "recovery_email_body_template",
  recoveryTelegramTemplate: "recovery_telegram_template",
  prolongedDowntimeEmailSubjectTemplate: "prolonged_downtime_email_subject_template",
  prolongedDowntimeEmailBodyTemplate: "prolonged_downtime_email_body_template",
  prolongedDowntimeTelegramTemplate: "prolonged_downtime_telegram_template",
  statusCodeAlertCodes: "status_code_alert_codes",
  savedEmailRecipients: "saved_email_recipients",
  monitoringInterval: "monitoring_interval",
  monitoringTimeout: "monitoring_timeout",
  monitoringRetries: "monitoring_retries",
  monitoringBatchSize: "monitoring_batch_size",
  monitoringMethod: "monitoring_method",
  monitoringResponseMaxLength: "monitoring_response_max_length",
  monitoringMaxRedirects: "monitoring_max_redirects",
  monitoringCheckSslExpiry: "monitoring_check_ssl_expiry",
  monitoringIgnoreSslErrors: "monitoring_ignore_ssl_errors",
  monitoringCacheBuster: "monitoring_cache_buster",
  monitoringSaveErrorPages: "monitoring_save_error_pages",
  monitoringSaveSuccessPages: "monitoring_save_success_pages",
  reduceMotion: "reduce_motion",
  compactDensity: "compact_density",
  sidebarAccent: "sidebar_accent",
  dashboardLandingPage: "dashboard_landing_page",
  showIncidentBanner: "show_incident_banner",
  showChartsSection: "show_charts_section",
  highContrastSurfaces: "high_contrast_surfaces",
  timeZone: "time_zone",
  use24HourClock: "use_24_hour_clock",
  publicStatusEnabled: "public_status_enabled",
  publicStatusSlug: "public_status_slug",
  publicStatusTitle: "public_status_title",
  publicStatusSummary: "public_status_summary",
  dataRetentionDays: "data_retention_days",
  autoBackupEnabled: "auto_backup_enabled",
  backupWindow: "backup_window",
  eventRetentionDays: "event_retention_days",
  lastBackupAt: "last_backup_at",
  updatedAt: "updated_at",
} as const;

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stringOrEmpty(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function booleanOrDefault(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function numberOrDefault(value: unknown, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function arrayOrDefault(value: unknown, fallback: string[]) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
}

function dateOrNull(value: unknown) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function getSettings(userId: string): Promise<SettingsPayload | null> {
  const [user, settings] = await Promise.all([readUserCompat(userId), readUserSettingsCompat(userId)]);
  if (!user) return null;

  return {
    profile: {
      firstName: stringOrEmpty(user.firstName),
      lastName: stringOrEmpty(user.lastName),
      email: stringOrEmpty(user.email),
      department: stringOrEmpty(user.department),
      username: stringOrEmpty(user.username),
      organization: stringOrEmpty(user.organization),
      jobTitle: stringOrEmpty(user.jobTitle),
      phone: stringOrEmpty(user.phone),
    },
    notifications: {
      notifyOnDown: booleanOrDefault(settings?.notifyOnDown, DEFAULT_SETTINGS.notifications.notifyOnDown),
      notifyOnRecovery: booleanOrDefault(settings?.notifyOnRecovery, DEFAULT_SETTINGS.notifications.notifyOnRecovery),
      notifyOnStatusChange: booleanOrDefault(
        settings?.notifyOnStatusChange,
        DEFAULT_SETTINGS.notifications.notifyOnStatusChange
      ),
      prolongedDowntimeEnabled: booleanOrDefault(
        settings?.prolongedDowntimeEnabled,
        DEFAULT_SETTINGS.notifications.prolongedDowntimeEnabled
      ),
      prolongedDowntimeMinutes: numberOrDefault(
        settings?.prolongedDowntimeMinutes,
        DEFAULT_SETTINGS.notifications.prolongedDowntimeMinutes
      ),
      alertDedupMinutes: numberOrDefault(
        settings?.alertDedupMinutes,
        DEFAULT_SETTINGS.notifications.alertDedupMinutes
      ),
      smtpHost: stringOrEmpty(settings?.smtpHost),
      smtpPort: numberOrDefault(settings?.smtpPort, DEFAULT_SETTINGS.notifications.smtpPort),
      smtpUsername: stringOrEmpty(settings?.smtpUsername),
      smtpPassword: "",
      smtpPasswordConfigured: Boolean(decryptValue(stringOrEmpty(settings?.smtpPasswordEncrypted))),
      smtpFromEmail: stringOrEmpty(settings?.smtpFromEmail),
      smtpDefaultToEmail: stringOrEmpty(settings?.smtpDefaultToEmail),
      smtpSecure: booleanOrDefault(settings?.smtpSecure, DEFAULT_SETTINGS.notifications.smtpSecure),
      smtpRequireTls: booleanOrDefault(settings?.smtpRequireTls, DEFAULT_SETTINGS.notifications.smtpRequireTls),
      smtpInsecureSkipVerify: booleanOrDefault(
        settings?.smtpInsecureSkipVerify,
        DEFAULT_SETTINGS.notifications.smtpInsecureSkipVerify
      ),
      discordWebhookUrl: stringOrEmpty(settings?.discordWebhookUrl),
      discordEnabled: booleanOrDefault(settings?.discordEnabled, DEFAULT_SETTINGS.notifications.discordEnabled),
      defaultEmailSubjectTemplate:
        stringOrEmpty(settings?.defaultEmailSubjectTemplate) || DEFAULT_SETTINGS.notifications.defaultEmailSubjectTemplate,
      defaultEmailBodyTemplate:
        stringOrEmpty(settings?.defaultEmailBodyTemplate) || DEFAULT_SETTINGS.notifications.defaultEmailBodyTemplate,
      defaultTelegramTemplate:
        stringOrEmpty(settings?.defaultTelegramTemplate) || DEFAULT_SETTINGS.notifications.defaultTelegramTemplate,
      recoveryEmailSubjectTemplate:
        stringOrEmpty(settings?.recoveryEmailSubjectTemplate) ||
        DEFAULT_SETTINGS.notifications.recoveryEmailSubjectTemplate,
      recoveryEmailBodyTemplate:
        stringOrEmpty(settings?.recoveryEmailBodyTemplate) ||
        DEFAULT_SETTINGS.notifications.recoveryEmailBodyTemplate,
      recoveryTelegramTemplate:
        stringOrEmpty(settings?.recoveryTelegramTemplate) || DEFAULT_SETTINGS.notifications.recoveryTelegramTemplate,
      prolongedDowntimeEmailSubjectTemplate:
        stringOrEmpty(settings?.prolongedDowntimeEmailSubjectTemplate) ||
        DEFAULT_SETTINGS.notifications.prolongedDowntimeEmailSubjectTemplate,
      prolongedDowntimeEmailBodyTemplate:
        stringOrEmpty(settings?.prolongedDowntimeEmailBodyTemplate) ||
        DEFAULT_SETTINGS.notifications.prolongedDowntimeEmailBodyTemplate,
      prolongedDowntimeTelegramTemplate:
        stringOrEmpty(settings?.prolongedDowntimeTelegramTemplate) ||
        DEFAULT_SETTINGS.notifications.prolongedDowntimeTelegramTemplate,
      statusCodeAlertCodes: stringOrDefault(
        settings?.statusCodeAlertCodes,
        DEFAULT_SETTINGS.notifications.statusCodeAlertCodes
      ),
      savedEmailRecipients: arrayOrDefault(
        settings?.savedEmailRecipients,
        DEFAULT_SETTINGS.notifications.savedEmailRecipients
      ),
    },
    monitoring: {
      interval: stringOrEmpty(settings?.monitoringInterval) || DEFAULT_SETTINGS.monitoring.interval,
      timeout: numberOrDefault(settings?.monitoringTimeout, DEFAULT_SETTINGS.monitoring.timeout),
      retries: numberOrDefault(settings?.monitoringRetries, DEFAULT_SETTINGS.monitoring.retries),
      batchSize: numberOrDefault(settings?.monitoringBatchSize, DEFAULT_SETTINGS.monitoring.batchSize),
      method: stringOrEmpty(settings?.monitoringMethod) || DEFAULT_SETTINGS.monitoring.method,
      responseMaxLength: numberOrDefault(
        settings?.monitoringResponseMaxLength,
        DEFAULT_SETTINGS.monitoring.responseMaxLength
      ),
      maxRedirects: numberOrDefault(settings?.monitoringMaxRedirects, DEFAULT_SETTINGS.monitoring.maxRedirects),
      checkSslExpiry: booleanOrDefault(settings?.monitoringCheckSslExpiry, DEFAULT_SETTINGS.monitoring.checkSslExpiry),
      ignoreSslErrors: booleanOrDefault(
        settings?.monitoringIgnoreSslErrors,
        DEFAULT_SETTINGS.monitoring.ignoreSslErrors
      ),
      cacheBuster: booleanOrDefault(settings?.monitoringCacheBuster, DEFAULT_SETTINGS.monitoring.cacheBuster),
      saveErrorPages: booleanOrDefault(
        settings?.monitoringSaveErrorPages,
        DEFAULT_SETTINGS.monitoring.saveErrorPages
      ),
      saveSuccessPages: booleanOrDefault(
        settings?.monitoringSaveSuccessPages,
        DEFAULT_SETTINGS.monitoring.saveSuccessPages
      ),
    },
    appearance: {
      reduceMotion: booleanOrDefault(settings?.reduceMotion, DEFAULT_SETTINGS.appearance.reduceMotion),
      compactDensity: booleanOrDefault(settings?.compactDensity, DEFAULT_SETTINGS.appearance.compactDensity),
      sidebarAccent: stringOrEmpty(settings?.sidebarAccent) || DEFAULT_SETTINGS.appearance.sidebarAccent,
      dashboardLandingPage:
        stringOrEmpty(settings?.dashboardLandingPage) || DEFAULT_SETTINGS.appearance.dashboardLandingPage,
      showIncidentBanner: booleanOrDefault(
        settings?.showIncidentBanner,
        DEFAULT_SETTINGS.appearance.showIncidentBanner
      ),
      showChartsSection: booleanOrDefault(
        settings?.showChartsSection,
        DEFAULT_SETTINGS.appearance.showChartsSection
      ),
      highContrastSurfaces: booleanOrDefault(
        settings?.highContrastSurfaces,
        DEFAULT_SETTINGS.appearance.highContrastSurfaces
      ),
      timeZone: stringOrEmpty(settings?.timeZone) || DEFAULT_SETTINGS.appearance.timeZone,
      use24HourClock: booleanOrDefault(settings?.use24HourClock, DEFAULT_SETTINGS.appearance.use24HourClock),
    },
    publicStatus: {
      enabled: booleanOrDefault(settings?.publicStatusEnabled, DEFAULT_SETTINGS.publicStatus.enabled),
      slug: stringOrEmpty(settings?.publicStatusSlug),
      title: stringOrEmpty(settings?.publicStatusTitle),
      summary: stringOrEmpty(settings?.publicStatusSummary),
    },
    data: {
      retentionDays: numberOrDefault(settings?.dataRetentionDays, DEFAULT_SETTINGS.data.retentionDays),
      autoBackupEnabled: booleanOrDefault(settings?.autoBackupEnabled, DEFAULT_SETTINGS.data.autoBackupEnabled),
      backupWindow: stringOrEmpty(settings?.backupWindow) || DEFAULT_SETTINGS.data.backupWindow,
      eventRetentionDays: numberOrDefault(settings?.eventRetentionDays, DEFAULT_SETTINGS.data.eventRetentionDays),
      lastBackupAt: dateOrNull(settings?.lastBackupAt)?.toISOString() ?? DEFAULT_SETTINGS.data.lastBackupAt,
    },
  };
}

async function readUserCompat(userId: string) {
  const columns = await getTableColumns("users");
  if (!columns.has("id")) {
    return null;
  }

  return readCompatRow("users", "id", userId, USERS_COLUMN_MAP, columns);
}

async function readUserSettingsCompat(userId: string) {
  const columns = await getTableColumns("user_settings");
  if (!columns.has("user_id")) {
    return null;
  }

  return readCompatRow("user_settings", "user_id", userId, USER_SETTINGS_COLUMN_MAP, columns);
}

async function readCompatRow<T extends Record<string, string>, R extends Partial<Record<keyof T, unknown>>>(
  tableName: TableName,
  lookupColumn: ColumnName<T>,
  lookupValue: string,
  columnMap: T,
  existingColumns: Set<string>
) {
  const selectableColumns = getSelectableColumns(columnMap, existingColumns);
  if (selectableColumns.length === 0) {
    return null;
  }

  try {
    const row = await readCompatRowValues(tableName, lookupColumn, lookupValue, selectableColumns);
    return row ? mapCompatRow<T, R>(row, selectableColumns) : null;
  } catch (error) {
    if (isSchemaDriftError(error)) {
      return null;
    }

    throw error;
  }
}

async function getTableColumns(tableName: TableName) {
  const rows = await sql<{ column_name: string }[]>`
    select column_name
    from information_schema.columns
    where table_schema = current_schema()
      and table_name = ${tableName}
  `;

  return new Set(rows.map((row) => row.column_name));
}

async function readCompatRowValues<T extends Record<string, string>>(
  tableName: TableName,
  lookupColumn: ColumnName<T>,
  lookupValue: string,
  selectableColumns: SelectableColumn<T>[]
) {
  const rows = await sql<Record<string, unknown>[]>`
    select ${buildSelectIdentifiers(selectableColumns)}
    from ${sql(tableName)}
    where ${sql(lookupColumn as string)} = ${lookupValue}
    limit 1
  `;

  return rows[0] ?? null;
}

function getSelectableColumns<T extends Record<string, string>>(
  columnMap: T,
  existingColumns: Set<string>
): SelectableColumn<T>[] {
  return (Object.entries(columnMap) as Array<[keyof T & string, ColumnName<T>]>)
    .filter(([, columnName]) => existingColumns.has(columnName))
    .map(([propertyName, columnName]) => ({ propertyName, columnName }));
}

function buildSelectIdentifiers<T extends Record<string, string>>(columns: SelectableColumn<T>[]) {
  const [firstColumn, ...restColumns] = columns.map((column) => column.columnName as string);
  if (!firstColumn) {
    throw new Error("At least one compatible column must be selected.");
  }

  return sql(firstColumn, ...restColumns);
}

function mapCompatRow<T extends Record<string, string>, R extends Partial<Record<keyof T, unknown>>>(
  row: Record<string, unknown>,
  selectableColumns: SelectableColumn<T>[]
) {
  return Object.fromEntries(
    selectableColumns.map(({ propertyName, columnName }) => [propertyName, row[columnName]])
  ) as R;
}

function filterValuesForColumns<T extends Record<string, unknown>>(
  values: T,
  columnMap: Record<string, string>,
  existingColumns: Set<string>
) {
  return Object.fromEntries(
    Object.entries(values).filter(([propertyName]) => existingColumns.has(columnMap[propertyName]))
  ) as Partial<T>;
}

function buildMissingSettingsTableError() {
  return {
    code: "42P01",
    message: "Required table user_settings is missing or not migrated.",
  };
}

function isSchemaDriftError(error: unknown) {
  const resolved = unwrapDatabaseError(error);
  const message = resolved.message?.toLowerCase() ?? "";
  return resolved.code === "42703" || (message.includes("column") && message.includes("does not exist"));
}

function unwrapDatabaseError(error: unknown): DatabaseErrorShape {
  const current = (error ?? {}) as DatabaseErrorShape;
  return current.cause ? unwrapDatabaseError(current.cause) : current;
}

export async function upsertSettings(
  userId: string,
  input: SettingsInput,
  database: DatabaseExecutor = db,
  skipReadback = false
) {
  const executor = database;
  if (input.notifications.discordWebhookUrl.trim().length > 0) {
    await assertSafeWebhookUrl(input.notifications.discordWebhookUrl);
  }

  const [userColumns, settingsColumns, existing] = await Promise.all([
    getTableColumns("users"),
    getTableColumns("user_settings"),
    readUserSettingsCompat(userId),
  ]);

  await updateUserCompat(executor, userId, input, userColumns);

  if (!settingsColumns.has("user_id")) {
    throw buildMissingSettingsTableError();
  }

  const encryptedPassword =
    input.notifications.smtpPassword.trim().length > 0
      ? encryptValue(input.notifications.smtpPassword)
      : stringOrEmpty(existing?.smtpPasswordEncrypted) || null;

  const values = {
    userId,
    notifyOnDown: input.notifications.notifyOnDown,
    notifyOnRecovery: input.notifications.notifyOnRecovery,
    notifyOnStatusChange: input.notifications.notifyOnStatusChange,
    prolongedDowntimeEnabled: input.notifications.prolongedDowntimeEnabled,
    prolongedDowntimeMinutes: input.notifications.prolongedDowntimeMinutes,
    alertDedupMinutes: input.notifications.alertDedupMinutes,
    smtpHost: emptyToNull(input.notifications.smtpHost),
    smtpPort: input.notifications.smtpPort,
    smtpUsername: emptyToNull(input.notifications.smtpUsername),
    smtpPasswordEncrypted: encryptedPassword,
    smtpFromEmail: emptyToNull(input.notifications.smtpFromEmail),
    smtpDefaultToEmail: emptyToNull(input.notifications.smtpDefaultToEmail),
    smtpSecure: input.notifications.smtpSecure,
    smtpRequireTls: input.notifications.smtpRequireTls,
    smtpInsecureSkipVerify: input.notifications.smtpInsecureSkipVerify,
    discordWebhookUrl: emptyToNull(input.notifications.discordWebhookUrl),
    discordEnabled: input.notifications.discordEnabled,
    defaultEmailSubjectTemplate: emptyToNull(input.notifications.defaultEmailSubjectTemplate),
    defaultEmailBodyTemplate: emptyToNull(input.notifications.defaultEmailBodyTemplate),
    defaultTelegramTemplate: emptyToNull(input.notifications.defaultTelegramTemplate),
    recoveryEmailSubjectTemplate: emptyToNull(input.notifications.recoveryEmailSubjectTemplate),
    recoveryEmailBodyTemplate: emptyToNull(input.notifications.recoveryEmailBodyTemplate),
    recoveryTelegramTemplate: emptyToNull(input.notifications.recoveryTelegramTemplate),
    prolongedDowntimeEmailSubjectTemplate: emptyToNull(input.notifications.prolongedDowntimeEmailSubjectTemplate),
    prolongedDowntimeEmailBodyTemplate: emptyToNull(input.notifications.prolongedDowntimeEmailBodyTemplate),
    prolongedDowntimeTelegramTemplate: emptyToNull(input.notifications.prolongedDowntimeTelegramTemplate),
    statusCodeAlertCodes: input.notifications.statusCodeAlertCodes.trim(),
    savedEmailRecipients: input.notifications.savedEmailRecipients,
    monitoringInterval: input.monitoring.interval,
    monitoringTimeout: input.monitoring.timeout,
    monitoringRetries: input.monitoring.retries,
    monitoringBatchSize: input.monitoring.batchSize,
    monitoringMethod: input.monitoring.method,
    monitoringResponseMaxLength: input.monitoring.responseMaxLength,
    monitoringMaxRedirects: input.monitoring.maxRedirects,
    monitoringCheckSslExpiry: input.monitoring.checkSslExpiry,
    monitoringIgnoreSslErrors: input.monitoring.ignoreSslErrors,
    monitoringCacheBuster: input.monitoring.cacheBuster,
    monitoringSaveErrorPages: input.monitoring.saveErrorPages,
    monitoringSaveSuccessPages: input.monitoring.saveSuccessPages,
    reduceMotion: input.appearance.reduceMotion,
    compactDensity: input.appearance.compactDensity,
    sidebarAccent: input.appearance.sidebarAccent,
    dashboardLandingPage: input.appearance.dashboardLandingPage,
    showIncidentBanner: input.appearance.showIncidentBanner,
    showChartsSection: input.appearance.showChartsSection,
    highContrastSurfaces: input.appearance.highContrastSurfaces,
    timeZone: input.appearance.timeZone,
    use24HourClock: input.appearance.use24HourClock,
    publicStatusEnabled: input.publicStatus.enabled,
    publicStatusSlug: input.publicStatus.enabled ? emptyToNull(input.publicStatus.slug) : null,
    publicStatusTitle: emptyToNull(input.publicStatus.title),
    publicStatusSummary: emptyToNull(input.publicStatus.summary),
    dataRetentionDays: input.data.retentionDays,
    autoBackupEnabled: input.data.autoBackupEnabled,
    backupWindow: input.data.backupWindow,
    eventRetentionDays: input.data.eventRetentionDays,
    lastBackupAt: input.data.lastBackupAt ? new Date(input.data.lastBackupAt) : dateOrNull(existing?.lastBackupAt),
    updatedAt: new Date(),
  };

  const filteredValues = filterValuesForColumns(values, USER_SETTINGS_COLUMN_MAP, settingsColumns);

  if (existing) {
    await executor.update(userSettings).set(filteredValues).where(eq(userSettings.userId, userId));
  } else {
    await executor
      .insert(userSettings)
      .values(filteredValues as typeof values & { userId: string });
  }

  await clearInheritedMonitorTemplates(executor, userId, existing);

  if (skipReadback) {
    return null;
  }

  return getSettings(userId);
}

async function updateUserCompat(
  executor: DatabaseExecutor,
  userId: string,
  input: SettingsInput,
  existingColumns: Set<string>
) {
  const values = {
    firstName: input.profile.firstName,
    lastName: input.profile.lastName,
    email: input.profile.email,
    department: emptyToNull(input.profile.department),
    username: emptyToNull(input.profile.username),
    organization: emptyToNull(input.profile.organization),
    jobTitle: emptyToNull(input.profile.jobTitle),
    phone: emptyToNull(input.profile.phone),
    updatedAt: new Date(),
  };

  const filteredValues = filterValuesForColumns(values, USERS_COLUMN_MAP, existingColumns);
  if (Object.keys(filteredValues).length === 0) {
    return;
  }

  await executor.update(users).set(filteredValues).where(eq(users.id, userId));
}

async function clearInheritedMonitorTemplates(
  executor: DatabaseExecutor,
  userId: string,
  existing: ExistingNotificationTemplates | null
) {
  if (!existing) {
    return;
  }

  await clearInheritedMonitorTemplate(
    executor,
    userId,
    "emailSubject",
    monitors.emailSubject,
    stringOrEmpty(existing.defaultEmailSubjectTemplate)
  );
  await clearInheritedMonitorTemplate(
    executor,
    userId,
    "emailBody",
    monitors.emailBody,
    stringOrEmpty(existing.defaultEmailBodyTemplate)
  );
  await clearInheritedMonitorTemplate(
    executor,
    userId,
    "telegramTemplate",
    monitors.telegramTemplate,
    stringOrEmpty(existing.defaultTelegramTemplate)
  );
}

async function clearInheritedMonitorTemplate(
  executor: DatabaseExecutor,
  userId: string,
  key: MonitorTemplateKey,
  column: typeof monitors.emailSubject | typeof monitors.emailBody | typeof monitors.telegramTemplate,
  inheritedTemplate: string
) {
  const template = inheritedTemplate.trim();
  if (!template) {
    return;
  }

  await executor
    .update(monitors)
    .set({ [key]: null })
    .where(and(eq(monitors.userId, userId), eq(column, inheritedTemplate)));
}
