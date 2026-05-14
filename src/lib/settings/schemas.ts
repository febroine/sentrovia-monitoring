import { z } from "zod";
import { isValidTimeZone } from "@/lib/time";

const optionalString = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .default("");
const optionalEmailString = (maxLength: number) =>
  optionalString(maxLength).refine(
    (value) => value.length === 0 || z.string().email().safeParse(value).success,
    "Enter a valid email address."
  );

const publicStatusSlug = z
  .string()
  .trim()
  .max(120)
  .default("")
  .transform(normalizePublicStatusSlug);

export const settingsSchema = z.object({
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
    notifyOnStatusChange: z.boolean(),
    prolongedDowntimeEnabled: z.boolean(),
    prolongedDowntimeMinutes: z.coerce.number().int().min(5).max(10080),
    alertDedupMinutes: z.coerce.number().int().min(0).max(1440),
    smtpHost: optionalString(255),
    smtpPort: z.coerce.number().int().min(1).max(65535),
    smtpUsername: optionalString(255),
    smtpPassword: optionalString(255),
    smtpPasswordConfigured: z.boolean().default(false),
    smtpFromEmail: optionalEmailString(255),
    smtpDefaultToEmail: optionalEmailString(255),
    smtpSecure: z.boolean(),
    smtpRequireTls: z.boolean(),
    smtpInsecureSkipVerify: z.boolean(),
    discordWebhookUrl: optionalString(500),
    discordEnabled: z.boolean(),
    defaultEmailSubjectTemplate: optionalString(500),
    defaultEmailBodyTemplate: optionalString(4000),
    defaultTelegramTemplate: optionalString(4000),
    recoveryEmailSubjectTemplate: optionalString(500),
    recoveryEmailBodyTemplate: optionalString(4000),
    recoveryTelegramTemplate: optionalString(4000),
    prolongedDowntimeEmailSubjectTemplate: optionalString(500),
    prolongedDowntimeEmailBodyTemplate: optionalString(4000),
    prolongedDowntimeTelegramTemplate: optionalString(4000),
    statusCodeAlertCodes: optionalString(500),
    savedEmailRecipients: z
      .array(z.string().trim().toLowerCase().email())
      .max(25)
      .default([])
      .transform((recipients) => Array.from(new Set(recipients))),
  }),
  monitoring: z.object({
    interval: z.string().trim().min(2).max(16),
    timeout: z.coerce.number().int().min(1000).max(120000),
    retries: z.coerce.number().int().min(1).max(10),
    batchSize: z.coerce.number().int().min(1).max(500),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
    responseMaxLength: z.coerce.number().int().min(0).max(100_000),
    maxRedirects: z.coerce.number().int().min(0).max(10),
    checkSslExpiry: z.boolean(),
    ignoreSslErrors: z.boolean(),
    cacheBuster: z.boolean(),
    saveErrorPages: z.boolean(),
    saveSuccessPages: z.boolean(),
  }),
  appearance: z.object({
    reduceMotion: z.boolean(),
    compactDensity: z.boolean(),
    sidebarAccent: z.enum(["amber", "emerald", "sky", "rose", "violet", "slate"]),
    dashboardLandingPage: z.enum(["dashboard", "monitoring", "companies", "logs", "settings"]),
    showIncidentBanner: z.boolean(),
    showChartsSection: z.boolean(),
    highContrastSurfaces: z.boolean(),
    timeZone: z.string().trim().min(1).max(100).refine(isValidTimeZone, "Select a supported time zone."),
    use24HourClock: z.boolean(),
  }),
  publicStatus: z
    .object({
      enabled: z.boolean(),
      slug: publicStatusSlug,
      title: optionalString(160),
      summary: optionalString(500),
    })
    .superRefine((value, context) => {
      if (!value.enabled) {
        return;
      }

      if (value.slug.length < 3) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slug"],
          message: "Public status slug must be at least 3 characters when enabled.",
        });
      }
    })
    .default({ enabled: false, slug: "", title: "", summary: "" }),
  data: z.object({
    retentionDays: z.coerce.number().int().min(7).max(3650),
    autoBackupEnabled: z.boolean(),
    backupWindow: z.string().trim().min(4).max(32),
    eventRetentionDays: z.coerce.number().int().min(1).max(3650),
    lastBackupAt: z.string().datetime().nullable().default(null),
  }),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

function normalizePublicStatusSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
