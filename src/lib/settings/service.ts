import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { maintenanceWindows, userSettings, users } from "@/lib/db/schema";
import { decryptValue, encryptValue } from "@/lib/security/encryption";
import type { SettingsInput } from "@/lib/settings/schemas";
import { DEFAULT_SETTINGS, type SettingsPayload } from "@/lib/settings/types";

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getSettings(userId: string): Promise<SettingsPayload | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return null;

  const [settings, maintenanceRows] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.userId, userId)).then((rows) => rows[0] ?? null),
    db.select().from(maintenanceWindows).where(eq(maintenanceWindows.userId, userId)),
  ]);

  return {
    maintenanceWindows: maintenanceRows.map((row) => ({
      id: row.id,
      name: row.name,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      timezone: row.timezone,
      isActive: row.isActive,
      suppressNotifications: row.suppressNotifications,
    })),
    profile: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      department: user.department ?? "",
      username: user.username ?? "",
      organization: user.organization ?? "",
      jobTitle: user.jobTitle ?? "",
      phone: user.phone ?? "",
    },
    notifications: {
      notifyOnDown: settings?.notifyOnDown ?? DEFAULT_SETTINGS.notifications.notifyOnDown,
      notifyOnRecovery: settings?.notifyOnRecovery ?? DEFAULT_SETTINGS.notifications.notifyOnRecovery,
      notifyOnLatency: settings?.notifyOnLatency ?? DEFAULT_SETTINGS.notifications.notifyOnLatency,
      notifyOnSslExpiry: settings?.notifyOnSslExpiry ?? DEFAULT_SETTINGS.notifications.notifyOnSslExpiry,
      notifyOnStatusChange: settings?.notifyOnStatusChange ?? DEFAULT_SETTINGS.notifications.notifyOnStatusChange,
      alertDedupMinutes:
        settings?.alertDedupMinutes ?? DEFAULT_SETTINGS.notifications.alertDedupMinutes,
      smtpHost: settings?.smtpHost ?? "",
      smtpPort: settings?.smtpPort ?? DEFAULT_SETTINGS.notifications.smtpPort,
      smtpUsername: settings?.smtpUsername ?? "",
      smtpPassword: "",
      smtpPasswordConfigured: Boolean(decryptValue(settings?.smtpPasswordEncrypted)),
      smtpFromEmail: settings?.smtpFromEmail ?? "",
      smtpDefaultToEmail: settings?.smtpDefaultToEmail ?? "",
      smtpSecure: settings?.smtpSecure ?? DEFAULT_SETTINGS.notifications.smtpSecure,
      smtpRequireTls: settings?.smtpRequireTls ?? DEFAULT_SETTINGS.notifications.smtpRequireTls,
      smtpInsecureSkipVerify:
        settings?.smtpInsecureSkipVerify ?? DEFAULT_SETTINGS.notifications.smtpInsecureSkipVerify,
      slackWebhookUrl: settings?.slackWebhookUrl ?? DEFAULT_SETTINGS.notifications.slackWebhookUrl,
      slackEnabled: settings?.slackEnabled ?? DEFAULT_SETTINGS.notifications.slackEnabled,
      discordWebhookUrl: settings?.discordWebhookUrl ?? DEFAULT_SETTINGS.notifications.discordWebhookUrl,
      discordEnabled: settings?.discordEnabled ?? DEFAULT_SETTINGS.notifications.discordEnabled,
      defaultEmailSubjectTemplate:
        settings?.defaultEmailSubjectTemplate ?? DEFAULT_SETTINGS.notifications.defaultEmailSubjectTemplate,
      defaultEmailBodyTemplate:
        settings?.defaultEmailBodyTemplate ?? DEFAULT_SETTINGS.notifications.defaultEmailBodyTemplate,
      defaultTelegramTemplate:
        settings?.defaultTelegramTemplate ?? DEFAULT_SETTINGS.notifications.defaultTelegramTemplate,
      statusCodeAlertCodes:
        settings?.statusCodeAlertCodes ?? DEFAULT_SETTINGS.notifications.statusCodeAlertCodes,
      savedEmailRecipients: settings?.savedEmailRecipients ?? DEFAULT_SETTINGS.notifications.savedEmailRecipients,
    },
    monitoring: {
      interval: settings?.monitoringInterval ?? DEFAULT_SETTINGS.monitoring.interval,
      timeout: settings?.monitoringTimeout ?? DEFAULT_SETTINGS.monitoring.timeout,
      retries: settings?.monitoringRetries ?? DEFAULT_SETTINGS.monitoring.retries,
      batchSize: settings?.monitoringBatchSize ?? DEFAULT_SETTINGS.monitoring.batchSize,
      method: settings?.monitoringMethod ?? DEFAULT_SETTINGS.monitoring.method,
      region: settings?.monitoringRegion ?? DEFAULT_SETTINGS.monitoring.region,
      maintenanceWindow: settings?.monitoringMaintenanceWindow ?? "",
      responseMaxLength:
        settings?.monitoringResponseMaxLength ?? DEFAULT_SETTINGS.monitoring.responseMaxLength,
      maxRedirects: settings?.monitoringMaxRedirects ?? DEFAULT_SETTINGS.monitoring.maxRedirects,
      ignoreSslErrors:
        settings?.monitoringIgnoreSslErrors ?? DEFAULT_SETTINGS.monitoring.ignoreSslErrors,
    },
    appearance: {
      reduceMotion: settings?.reduceMotion ?? DEFAULT_SETTINGS.appearance.reduceMotion,
      compactDensity: settings?.compactDensity ?? DEFAULT_SETTINGS.appearance.compactDensity,
      sidebarAccent: settings?.sidebarAccent ?? DEFAULT_SETTINGS.appearance.sidebarAccent,
      dashboardLandingPage:
        settings?.dashboardLandingPage ?? DEFAULT_SETTINGS.appearance.dashboardLandingPage,
      showIncidentBanner:
        settings?.showIncidentBanner ?? DEFAULT_SETTINGS.appearance.showIncidentBanner,
      showChartsSection:
        settings?.showChartsSection ?? DEFAULT_SETTINGS.appearance.showChartsSection,
    },
    data: {
      retentionDays: settings?.dataRetentionDays ?? DEFAULT_SETTINGS.data.retentionDays,
      autoBackupEnabled: settings?.autoBackupEnabled ?? DEFAULT_SETTINGS.data.autoBackupEnabled,
      backupWindow: settings?.backupWindow ?? DEFAULT_SETTINGS.data.backupWindow,
      eventRetentionDays: settings?.eventRetentionDays ?? DEFAULT_SETTINGS.data.eventRetentionDays,
      lastBackupAt: settings?.lastBackupAt?.toISOString() ?? DEFAULT_SETTINGS.data.lastBackupAt,
    },
  };
}

export async function upsertSettings(userId: string, input: SettingsInput) {
  await db
    .update(users)
    .set({
      firstName: input.profile.firstName,
      lastName: input.profile.lastName,
      email: input.profile.email,
      department: emptyToNull(input.profile.department),
      username: emptyToNull(input.profile.username),
      organization: emptyToNull(input.profile.organization),
      jobTitle: emptyToNull(input.profile.jobTitle),
      phone: emptyToNull(input.profile.phone),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  const [existing] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  const encryptedPassword =
    input.notifications.smtpPassword.trim().length > 0
      ? encryptValue(input.notifications.smtpPassword)
      : existing?.smtpPasswordEncrypted ?? null;

  const values = {
    userId,
    notifyOnDown: input.notifications.notifyOnDown,
    notifyOnRecovery: input.notifications.notifyOnRecovery,
    notifyOnLatency: input.notifications.notifyOnLatency,
    notifyOnSslExpiry: input.notifications.notifyOnSslExpiry,
    notifyOnStatusChange: input.notifications.notifyOnStatusChange,
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
    slackWebhookUrl: emptyToNull(input.notifications.slackWebhookUrl),
    slackEnabled: input.notifications.slackEnabled,
    discordWebhookUrl: emptyToNull(input.notifications.discordWebhookUrl),
    discordEnabled: input.notifications.discordEnabled,
    defaultEmailSubjectTemplate: emptyToNull(input.notifications.defaultEmailSubjectTemplate),
    defaultEmailBodyTemplate: emptyToNull(input.notifications.defaultEmailBodyTemplate),
    defaultTelegramTemplate: emptyToNull(input.notifications.defaultTelegramTemplate),
    statusCodeAlertCodes: emptyToNull(input.notifications.statusCodeAlertCodes),
    savedEmailRecipients: input.notifications.savedEmailRecipients,
    monitoringInterval: input.monitoring.interval,
    monitoringTimeout: input.monitoring.timeout,
    monitoringRetries: input.monitoring.retries,
    monitoringBatchSize: input.monitoring.batchSize,
    monitoringMethod: input.monitoring.method,
    monitoringRegion: emptyToNull(input.monitoring.region) ?? DEFAULT_SETTINGS.monitoring.region,
    monitoringMaintenanceWindow: emptyToNull(input.monitoring.maintenanceWindow),
    monitoringResponseMaxLength: input.monitoring.responseMaxLength,
    monitoringMaxRedirects: input.monitoring.maxRedirects,
    monitoringIgnoreSslErrors: input.monitoring.ignoreSslErrors,
    reduceMotion: input.appearance.reduceMotion,
    compactDensity: input.appearance.compactDensity,
    sidebarAccent: input.appearance.sidebarAccent,
    dashboardLandingPage: input.appearance.dashboardLandingPage,
    showIncidentBanner: input.appearance.showIncidentBanner,
    showChartsSection: input.appearance.showChartsSection,
    dataRetentionDays: input.data.retentionDays,
    autoBackupEnabled: input.data.autoBackupEnabled,
    backupWindow: input.data.backupWindow,
    eventRetentionDays: input.data.eventRetentionDays,
    lastBackupAt: input.data.lastBackupAt ? new Date(input.data.lastBackupAt) : existing?.lastBackupAt ?? null,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(userSettings).set(values).where(eq(userSettings.userId, userId));
  } else {
    await db.insert(userSettings).values(values);
  }

  await syncMaintenanceWindows(userId, input.maintenanceWindows);

  return getSettings(userId);
}

async function syncMaintenanceWindows(userId: string, windows: SettingsInput["maintenanceWindows"]) {
  await db.delete(maintenanceWindows).where(eq(maintenanceWindows.userId, userId));

  if (windows.length === 0) {
    return;
  }

  await db.insert(maintenanceWindows).values(
    windows.map((window) => ({
      id: window.id || crypto.randomUUID(),
      userId,
      name: window.name,
      startsAt: new Date(window.startsAt),
      endsAt: new Date(window.endsAt),
      timezone: window.timezone || "Europe/Istanbul",
      isActive: window.isActive,
      suppressNotifications: window.suppressNotifications,
      updatedAt: new Date(),
    }))
  );
}
