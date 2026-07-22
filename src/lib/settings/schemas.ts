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
const profileUsername = z
  .string()
  .trim()
  .max(80, "Username is too long.")
  .transform((value) => value.toLowerCase())
  .refine(
    (value) => value.length === 0 || value.length >= 3,
    "Username must be at least 3 characters long."
  )
  .refine(
    (value) => value.length === 0 || /^[a-z0-9._-]+$/.test(value),
    "Username can only include letters, numbers, dots, underscores, and dashes."
  );

const publicStatusSlug = z
  .string()
  .trim()
  .max(120)
  .default("")
  .transform(normalizePublicStatusSlug);
const MONITORING_INTERVAL_PATTERN = /^(\d+)\s*(s|sn|sec|m|min|dk|h|hr|sa)$/;
const MIN_MONITORING_INTERVAL_VALUE = 1;
const MAX_MONITORING_INTERVAL_VALUE = 1440;

const settingsObjectSchema = z.object({
  profile: z.object({
    firstName: z.string().trim().min(2).max(80),
    lastName: z.string().trim().min(2).max(80),
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    department: optionalString(120),
    username: profileUsername,
    organization: optionalString(160),
    jobTitle: optionalString(120),
    phone: optionalString(40),
  }),
  notifications: z.object({
    notificationLanguage: z.enum(["en", "tr"]).default("en"),
    notifyOnDown: z.boolean(),
    notifyOnRecovery: z.boolean(),
    notifyOnStatusChange: z.boolean(),
    notifyOnLatency: z.boolean().default(true),
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
    interval: z.string().trim().min(2).max(16).transform(normalizeMonitoringInterval),
    timeout: z.coerce.number().int().min(1000).max(120000),
    retries: z.coerce.number().int().min(2).max(10),
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
    showOutageBanner: z.boolean(),
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
      companyId: z.union([z.literal(""), z.string().uuid()]).default(""),
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
    .default({ enabled: false, slug: "", title: "", summary: "", companyId: "" }),
  data: z.object({
    retentionDays: z.coerce.number().int().min(7).max(3650),
    deliveryRetentionDays: z.coerce.number().int().min(7).max(3650).default(90),
    autoBackupEnabled: z.boolean(),
    backupWindow: z.string().trim().min(4).max(32),
    eventRetentionDays: z.coerce.number().int().min(1).max(3650),
    lastBackupAt: z.string().datetime().nullable().default(null),
  }),
});

export const settingsSchema = z.preprocess(normalizeLegacySettingsInput, settingsObjectSchema);

export type SettingsInput = z.infer<typeof settingsSchema>;

function normalizeLegacySettingsInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const input = value as Record<string, unknown>;
  const appearance = input.appearance;
  if (!appearance || typeof appearance !== "object" || Array.isArray(appearance)) {
    return value;
  }

  const appearanceInput = appearance as Record<string, unknown>;
  if (appearanceInput.showOutageBanner !== undefined || typeof appearanceInput.showIncidentBanner !== "boolean") {
    return value;
  }

  const { showIncidentBanner, ...currentAppearance } = appearanceInput;
  return {
    ...input,
    appearance: { ...currentAppearance, showOutageBanner: showIncidentBanner },
  };
}

function normalizePublicStatusSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeMonitoringInterval(value: string, context: z.RefinementCtx) {
  const match = value.toLowerCase().match(MONITORING_INTERVAL_PATTERN);
  if (!match) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter an interval like 30s, 5m, or 1h.",
    });
    return z.NEVER;
  }

  const amount = Number(match[1]);
  if (amount < MIN_MONITORING_INTERVAL_VALUE || amount > MAX_MONITORING_INTERVAL_VALUE) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Interval value must be between ${MIN_MONITORING_INTERVAL_VALUE} and ${MAX_MONITORING_INTERVAL_VALUE}.`,
    });
    return z.NEVER;
  }

  const unit = match[2];
  if (["s", "sn", "sec"].includes(unit)) {
    return `${amount}s`;
  }

  if (["h", "hr", "sa"].includes(unit)) {
    return `${amount}h`;
  }

  return `${amount}m`;
}
