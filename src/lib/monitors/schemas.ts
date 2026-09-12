import { z } from "zod";
import { getMonitorPauseDurationMs, MAX_MONITOR_PAUSE_MS } from "@/lib/monitors/pause";
import { env } from "@/lib/env";
import { MAX_HEARTBEAT_TOKEN_LENGTH, MIN_HEARTBEAT_TOKEN_LENGTH } from "@/lib/monitors/constants";
import { isMonitorNetworkHostnameLiteralAllowed } from "@/lib/security/public-network-target";

const monitorTypeSchema = z.enum(["http", "keyword", "json", "port", "postgres", "ping", "heartbeat"]);
const notificationPrefSchema = z.enum(["email", "telegram", "both", "none"]);
const notificationLanguageSchema = z.enum(["default", "en", "tr"]);
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

function optionalPositiveInteger(max: number) {
  return z
    .preprocess(
      (value) => (typeof value === "string" && value.trim().length === 0 ? null : value),
      z.union([z.coerce.number().int().min(1).max(max), z.literal(null)])
    )
    .default(null);
}

const expectedStatusCodesSchema = z
  .string()
  .trim()
  .max(500)
  .optional()
  .or(z.literal(""))
  .superRefine((value, context) => {
    const trimmed = (value ?? "").trim();
    if (trimmed.length > 0 && !isValidExpectedStatusCodeList(trimmed)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter HTTP status codes between 100 and 599, separated by commas.",
      });
    }
  })
  .transform((value) => normalizeExpectedStatusCodes(value ?? ""));

function isSafeHostInput(value: string) {
  const normalized = value.trim();

  return normalized.length > 0 && !normalized.startsWith("-") && !INVALID_HOST_INPUT_PATTERN.test(normalized);
}

function isHttpMonitorUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      !parsed.username &&
      !parsed.password &&
      isAllowedMonitorHostnameLiteral(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function isAllowedMonitorHostnameLiteral(hostname: string) {
  return isMonitorNetworkHostnameLiteralAllowed(hostname, env.monitorAllowPrivateTargets);
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

const monitorInputObjectSchema = z
  .object({
    name: z.string().trim().min(1, "Monitor name is required.").max(120),
    monitorType: monitorTypeSchema.default("http"),
    url: optionalRequiredString(2000),
    portHost: optionalRequiredString(255),
    portNumber: z.coerce.number().int().min(1).max(65_535).default(443),
    heartbeatToken: optionalRequiredString(MAX_HEARTBEAT_TOKEN_LENGTH),
    heartbeatLastReceivedAt: z.string().datetime().nullable().default(null),
    databaseHost: optionalRequiredString(255),
    databasePort: z.coerce.number().int().min(1).max(65_535).default(5432),
    databaseName: optionalRequiredString(120),
    databaseUsername: optionalRequiredString(120),
    databasePassword: optionalRequiredString(500),
    databasePasswordConfigured: z.boolean().default(false),
    databaseSsl: z.boolean().default(true),
    databaseTlsVerify: z.boolean().default(true),
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
    notificationPref: notificationPrefSchema.default("both"),
    notificationLanguage: notificationLanguageSchema.default("default"),
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
    slowResponseThresholdMs: optionalPositiveInteger(120000),
    slowResponseAlertsEnabled: z.boolean().default(true),
    expectedStatusCodes: expectedStatusCodesSchema,
    retries: z.coerce.number().int().min(2).max(10),
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
    emailHeadline: optionalString(500),
    emailBody: optionalString(4000),
    slowResponseEmailSubject: optionalString(500),
    slowResponseEmailHeadline: optionalString(500),
    slowResponseEmailBody: optionalString(4000),
    slowResponseTelegramTemplate: optionalString(4000),
    recoveryEmailSubject: optionalString(500),
    recoveryEmailHeadline: optionalString(500),
    recoveryEmailBody: optionalString(4000),
    recoveryTelegramTemplate: optionalString(4000),
    prolongedDowntimeEmailSubject: optionalString(500),
    prolongedDowntimeEmailHeadline: optionalString(500),
    prolongedDowntimeEmailBody: optionalString(4000),
    prolongedDowntimeTelegramTemplate: optionalString(4000),
    sslExpiryEmailSubject: optionalString(500),
    sslExpiryEmailHeadline: optionalString(500),
    sslExpiryEmailBody: optionalString(4000),
    sslExpiryTelegramTemplate: optionalString(4000),
    sendOutageScreenshot: z.boolean().default(true),
    isActive: z.boolean().default(true),
    publishOnStatusPage: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (value.monitorType === "http" || value.monitorType === "keyword" || value.monitorType === "json") {
      if (!isHttpMonitorUrl(value.url)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: "Enter a valid allowed HTTP or HTTPS URL for this monitor type.",
        });
      }

      if (value.slowResponseThresholdMs !== null && value.slowResponseThresholdMs >= value.timeout) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slowResponseThresholdMs"],
          message: "Slow response threshold must be lower than the hard failure timeout.",
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

    const hasTelegramToken = Boolean(value.telegramBotToken);
    const hasTelegramChatId = Boolean(value.telegramChatId);
    if (hasTelegramToken !== hasTelegramChatId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasTelegramToken ? "telegramChatId" : "telegramBotToken"],
        message: "Configure both monitor-level Telegram fields, or leave both blank to use company or workspace defaults.",
      });
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
      } else if (!isAllowedMonitorHostnameLiteral(value.portHost)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["portHost"],
          message: "Enter an allowed hostname or IP address for this monitor.",
        });
      }
      return;
    }

    if (value.monitorType === "heartbeat") {
      if (
        value.heartbeatToken.trim().length > 0 &&
        value.heartbeatToken.trim().length < MIN_HEARTBEAT_TOKEN_LENGTH
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["heartbeatToken"],
          message: `Heartbeat token must be at least ${MIN_HEARTBEAT_TOKEN_LENGTH} characters if you provide one.`,
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
    } else if (!isAllowedMonitorHostnameLiteral(value.databaseHost)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["databaseHost"],
        message: "Enter an allowed hostname or IP address for the database monitor.",
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

export const monitorInputSchema = z.preprocess(normalizeLegacyMonitorInput, monitorInputObjectSchema);

export const monitorBulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

export const monitorBulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  payload: monitorInputSchema,
});

export const monitorActiveStateSchema = z.object({
  isActive: z.boolean(),
});

const monitorPauseIdsSchema = z.array(z.string().uuid()).min(1).max(500);
const monitorPauseDurationSchema = z.object({
  ids: monitorPauseIdsSchema,
  action: z.literal("pause"),
  durationValue: z.number().int().min(1).max(525_600),
  durationUnit: z.enum(["minutes", "hours", "days"]),
}).refine((value) => {
  return getMonitorPauseDurationMs(value.durationValue, value.durationUnit) <= MAX_MONITOR_PAUSE_MS;
}, {
  message: "Pause duration must be between 1 minute and 365 days.",
  path: ["durationValue"],
});

export const monitorPauseSchema = z.discriminatedUnion("action", [
  monitorPauseDurationSchema,
  z.object({ ids: monitorPauseIdsSchema, action: z.literal("resume") }),
]);

export type MonitorInput = z.infer<typeof monitorInputSchema>;

function normalizeLegacyMonitorInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const input = value as Record<string, unknown>;
  if (input.sendOutageScreenshot !== undefined || typeof input.sendIncidentScreenshot !== "boolean") {
    return value;
  }

  const { sendIncidentScreenshot, ...currentInput } = input;
  return { ...currentInput, sendOutageScreenshot: sendIncidentScreenshot };
}

function normalizeExpectedStatusCodes(value: string) {
  return parseExpectedStatusCodes(value).join(", ");
}

function isValidExpectedStatusCodeList(value: string) {
  const tokens = tokenizeExpectedStatusCodes(value);
  return tokens.length > 0 && tokens.every((token) => {
    const statusCode = Number(token);
    return /^\d+$/.test(token) && Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599;
  });
}

function parseExpectedStatusCodes(value: string) {
  return Array.from(
    new Set(
      tokenizeExpectedStatusCodes(value)
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isInteger(item) && item >= 100 && item <= 599)
    )
  ).sort((left, right) => left - right);
}

function tokenizeExpectedStatusCodes(value: string) {
  return value.split(/[,\s;]+/).map((item) => item.trim()).filter(Boolean);
}
