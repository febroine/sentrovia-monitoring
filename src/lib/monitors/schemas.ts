import { z } from "zod";
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
const TELEGRAM_NOTIFICATION_PREFS = new Set(["telegram", "both"]);

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

export const monitorInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
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
    sendIncidentScreenshot: z.boolean().default(true),
    isActive: z.boolean().default(true),
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

    if (TELEGRAM_NOTIFICATION_PREFS.has(value.notificationPref)) {
      if (!value.telegramBotToken) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["telegramBotToken"],
          message: "Enter a Telegram bot token when Telegram notifications are enabled.",
        });
      }

      if (!value.telegramChatId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["telegramChatId"],
          message: "Enter a Telegram chat id when Telegram notifications are enabled.",
        });
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
