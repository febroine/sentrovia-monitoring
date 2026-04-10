import { z } from "zod";

export const monitorTypeSchema = z.enum(["http", "port", "postgres"]);
export const notificationPrefSchema = z.enum(["email", "telegram", "both", "none"]);
export const intervalUnitSchema = z.enum(["sn", "dk", "sa"]);
export const ipFamilySchema = z.enum(["auto", "ipv4", "ipv6"]);
export const methodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

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

export const monitorInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    monitorType: monitorTypeSchema.default("http"),
    url: optionalRequiredString(2000),
    portHost: optionalRequiredString(255),
    portNumber: z.coerce.number().int().min(1).max(65_535).default(443),
    databaseHost: optionalRequiredString(255),
    databasePort: z.coerce.number().int().min(1).max(65_535).default(5432),
    databaseName: optionalRequiredString(120),
    databaseUsername: optionalRequiredString(120),
    databasePassword: optionalRequiredString(500),
    databasePasswordConfigured: z.boolean().default(false),
    databaseSsl: z.boolean().default(true),
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
      .email()
      .optional()
      .or(z.literal(""))
      .transform((value) => (value && value.length > 0 ? value : null)),
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
    if (value.monitorType === "http") {
      const parsed = z.string().trim().url().safeParse(value.url);
      if (!parsed.success) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["url"],
          message: "Enter a valid URL for an HTTP monitor.",
        });
      }
      return;
    }

    if (value.monitorType === "port") {
      if (value.portHost.trim().length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["portHost"],
          message: "Enter a hostname or IP address for the port monitor.",
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

export type MonitorInput = z.infer<typeof monitorInputSchema>;
