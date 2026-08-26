import { z } from "zod";

const COMPANY_EMAIL_SPLIT_PATTERN = /[,;\n]/;

function normalizeCompanyEmailRecipients(value: string) {
  return Array.from(new Set(
    value
      .split(COMPANY_EMAIL_SPLIT_PATTERN)
      .map((recipient) => recipient.trim().toLowerCase())
      .filter(Boolean)
  ));
}

export const companyInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  notificationEmailRecipients: z
    .string()
    .trim()
    .max(4000)
    .default("")
    .transform(normalizeCompanyEmailRecipients),
  telegramBotToken: z.string().trim().max(500).default(""),
  telegramBotTokenConfigured: z.boolean().default(false),
  telegramChatId: z.string().trim().max(120).default(""),
  isActive: z.boolean().default(true),
}).superRefine((value, context) => {
  for (const recipient of value.notificationEmailRecipients) {
    if (!z.string().email().safeParse(recipient).success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notificationEmailRecipients"],
        message: `Invalid notification recipient: ${recipient}`,
      });
    }
  }

  if (value.notificationEmailRecipients.length > 25) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["notificationEmailRecipients"],
      message: "Enter at most 25 company notification recipients.",
    });
  }

  const hasTelegramToken = value.telegramBotToken.length > 0 || value.telegramBotTokenConfigured;
  if (hasTelegramToken !== (value.telegramChatId.length > 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [hasTelegramToken ? "telegramChatId" : "telegramBotToken"],
      message: "Configure both a Telegram bot token and chat ID, or leave both empty.",
    });
  }
});

export const companyBulkActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(["activate", "deactivate", "delete"]),
});

export type CompanyInput = z.infer<typeof companyInputSchema>;
