import { z } from "zod";

const monitorTypeSchema = z.enum(["http", "keyword", "json", "port", "postgres", "ping", "heartbeat"]);
const notificationPrefSchema = z.enum(["email", "telegram", "both", "none"]);
const intervalUnitSchema = z.enum(["sn", "dk", "sa"]);
const ipFamilySchema = z.enum(["auto", "ipv4", "ipv6"]);
const methodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const jsonMatchModeSchema = z.enum(["equals", "contains", "exists"]);
const INVALID_HOST_INPUT_PATTERN = /[\s/?#]/;
const MAX_MONITOR_EMAIL_RECIPIENTS = 25;
const MAX_MONITOR_EMAIL_RECIPIENTS_LENGTH = 2000;

function optionalString(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));
}

function optionalRequiredString(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .default("");
}

function isSafeHostInput(value: string) {
  const normalized = value.trim();

  return normalized.length > 0 && !normalized.startsWith("-") && !INVALID_HOST_INPUT_PATTERN.test(normalized);
}

function normalizeEmailRecipients(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,;\n]/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export const monitorInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    monitorType: monitorTypeSchema.default("http"),
    url: optionalRequiredString(2000),
    portHost: optionalRequiredString(255),
    portNumber: z.coerce.number().int().min(1).max(65_535).default(443),
    heartbeatToken: optionalRequiredString(255),
    heartbeatLastReceivedAt: z.string().datetime().nullable().default(null),
    databaseHost: optionalRequiredString(255),
    databasePort: z.coerce.number().int().min(1).max(65_535).default(5432),
    databaseName: optionalRequiredString(120),
    databaseUsername: optionalRequiredString(120),
    databasePassword: optionalRequiredString(500),
    databasePasswordConfigured: z.boolean().default(false),
    databaseSsl: z.boolean().default(true),
    keywordQuery: optionalRequiredString(500),
    keywordInvert: z.boolean().default(false),
    jsonPath: optionalRequiredString(255),
    jsonExpectedValue: optionalRequiredString(500),
    jsonMatchMode: jsonMatchModeSchema.default("equals"),
    companyId: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value && value.length > 0 ? value : null)),
    company: optionalString(160),
    notificationPref: notificationPrefSchema,
    notifEmail: z
      .string()
      .trim()
      .max(MAX_MONITOR_EMAIL_RECIPIENTS_LENGTH)
      .optional()
      .or(z.literal(""))
      .transform((value) => {
        const recipients = normalizeEmailRecipients(value ?? "");
        return recipients.length > 0 ? recipients.join(", ") : null;
      }),
    telegramBotToken: optionalString(500),
    telegramChatId: optionalString(120),
    intervalValue: z.coerce.number().int().min(1).max(1440),
    intervalUnit: intervalUnitSchema,
    timeout: z.coerce.number().int().min(1000).max(120000),
    retries: z.coerce.number().int().min(1).max(10),
    method: methodSchema,
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    renotifyCount: z
      .union([z.coerce.number().int().min(1).max(10), z.literal(null)])
      .default(null),
    maxRedirects: z.coerce.number().int().min(0).max(10),
    ipFamily: ipFamilySchema,
    checkSslExpiry: z.boolean().default(false),
    ignoreSslErrors: z.boolean().default(false),
    cacheBuster: z.boolean().default(false),
    saveErrorPages: z.boolean().default(false),
    saveSuccessPages: z.boolean().default(false),
    responseMaxLength: z.coerce.number().int().min(0).max(100_000),
    telegramTemplate: optionalString(4000),
    emailSubject: optionalString(500),
    emailBody: optionalString(4000),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (value.monitorType === "http" || value.monitorType === "keyword" || value.monitorType === "json") {
      const parsed = z.string().trim().url().safeParse(value.url);
      if (!parsed.success) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: "Enter a valid URL for this monitor type.",
        });
      }
    }

    if (value.notificationPref === "email" || value.notificationPref === "both") {
      const recipients = normalizeEmailRecipients(value.notifEmail ?? "");
      if (recipients.length > MAX_MONITOR_EMAIL_RECIPIENTS) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["notifEmail"],
          message: `Enter at most ${MAX_MONITOR_EMAIL_RECIPIENTS} email recipients.`,
        });
      }

      for (const recipient of recipients) {
        if (!z.string().email().safeParse(recipient).success) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["notifEmail"],
            message: `Invalid email recipient: ${recipient}`,
          });
        }
      }
    }

    if (value.monitorType === "http") {
      return;
    }

    if (value.monitorType === "keyword") {
      if (value.keywordQuery.trim().length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["keywordQuery"],
          message: "Enter the keyword or phrase that Sentrovia should look for.",
        });
      }
      return;
    }

    if (value.monitorType === "json") {
      if (value.jsonPath.trim().length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["jsonPath"],
          message: "Enter a JSON path such as data.status or result.items[0].name.",
        });
      }

      if (value.jsonMatchMode !== "exists" && value.jsonExpectedValue.trim().length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["jsonExpectedValue"],
          message: "Enter the expected JSON value for this assertion.",
        });
      }
      return;
    }

    if (value.monitorType === "port" || value.monitorType === "ping") {
      if (value.portHost.trim().length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["portHost"],
          message:
            value.monitorType === "ping"
              ? "Enter a hostname or IP address for the ping monitor."
              : "Enter a hostname or IP address for the port monitor.",
        });
      } else if (!isSafeHostInput(value.portHost)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["portHost"],
          message: "Enter a valid hostname or IP address without spaces, URL prefixes, or leading dashes.",
        });
      }
      return;
    }

    if (value.monitorType === "heartbeat") {
      if (value.heartbeatToken.trim().length > 0 && value.heartbeatToken.trim().length < 8) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["heartbeatToken"],
          message: "Heartbeat token must be at least 8 characters if you provide one.",
        });
      }
      return;
    }

    if (value.databaseHost.trim().length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["databaseHost"],
        message: "Enter the database host.",
      });
    } else if (!isSafeHostInput(value.databaseHost)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["databaseHost"],
        message: "Enter a valid database host without spaces, URL prefixes, or leading dashes.",
      });
    }

    if (value.databaseName.trim().length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["databaseName"],
        message: "Enter the database name.",
      });
    }

    if (value.databaseUsername.trim().length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["databaseUsername"],
        message: "Enter the database username.",
      });
    }

    if (value.databasePassword.trim().length === 0 && !value.databasePasswordConfigured) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["databasePassword"],
        message: "Enter the database password.",
      });
    }
  });

export const monitorBulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export const monitorBulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  payload: monitorInputSchema,
});

export const monitorActiveStateSchema = z.object({
  isActive: z.boolean(),
});

export type MonitorInput = z.infer<typeof monitorInputSchema>;
