import { z } from "zod";

const optionalString = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .default("");

export const settingsSchema = z.object({
  maintenanceWindows: z.array(
    z.object({
      id: optionalString(120),
      name: z.string().trim().min(2).max(160),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
      timezone: optionalString(64),
      isActive: z.boolean(),
      suppressNotifications: z.boolean(),
    })
  ),
  profile: z.object({
    firstName: z.string().trim().min(2).max(80),
    lastName: z.string().trim().min(2).max(80),
    email: z.string().trim().email(),
    department: optionalString(120),
    username: optionalString(80),
    organization: optionalString(160),
    jobTitle: optionalString(120),
    phone: optionalString(40),
  }),
  notifications: z.object({
    notifyOnDown: z.boolean(),
    notifyOnRecovery: z.boolean(),
    notifyOnLatency: z.boolean(),
    notifyOnSslExpiry: z.boolean(),
    notifyOnStatusChange: z.boolean(),
    alertDedupMinutes: z.coerce.number().int().min(0).max(1440),
    smtpHost: optionalString(255),
    smtpPort: z.coerce.number().int().min(1).max(65535),
    smtpUsername: optionalString(255),
    smtpPassword: optionalString(255),
    smtpPasswordConfigured: z.boolean().default(false),
    smtpFromEmail: optionalString(255),
    smtpDefaultToEmail: optionalString(255),
    smtpSecure: z.boolean(),
    smtpRequireTls: z.boolean(),
    smtpInsecureSkipVerify: z.boolean(),
    slackWebhookUrl: optionalString(500),
    slackEnabled: z.boolean(),
    discordWebhookUrl: optionalString(500),
    discordEnabled: z.boolean(),
    defaultEmailSubjectTemplate: optionalString(500),
    defaultEmailBodyTemplate: optionalString(4000),
    defaultTelegramTemplate: optionalString(4000),
    statusCodeAlertCodes: optionalString(500),
    savedEmailRecipients: z.array(z.string().trim().email()).default([]),
  }),
  monitoring: z.object({
    interval: z.string().trim().min(2).max(16),
    timeout: z.coerce.number().int().min(1000).max(120000),
    retries: z.coerce.number().int().min(1).max(10),
    batchSize: z.coerce.number().int().min(1).max(500),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
    region: optionalString(64),
    maintenanceWindow: optionalString(120),
    responseMaxLength: z.coerce.number().int().min(0).max(100_000),
    maxRedirects: z.coerce.number().int().min(0).max(10),
    ignoreSslErrors: z.boolean(),
  }),
  appearance: z.object({
    reduceMotion: z.boolean(),
    compactDensity: z.boolean(),
    sidebarAccent: z.enum(["amber", "emerald", "sky", "rose", "violet", "slate"]),
    dashboardLandingPage: z.enum(["dashboard", "monitoring", "companies", "logs", "settings"]),
    showIncidentBanner: z.boolean(),
    showChartsSection: z.boolean(),
  }),
  data: z.object({
    retentionDays: z.coerce.number().int().min(7).max(3650),
    autoBackupEnabled: z.boolean(),
    backupWindow: z.string().trim().min(4).max(32),
    eventRetentionDays: z.coerce.number().int().min(1).max(3650),
    lastBackupAt: z.string().datetime().nullable().default(null),
  }),
});

export type SettingsInput = z.infer<typeof settingsSchema>;
