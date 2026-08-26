import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, monitors, userSettings } from "@/lib/db/schema";
import { decryptValueOrLegacyPlaintext } from "@/lib/security/encryption";

interface NotificationRoutingCandidates {
  monitorEmail: string | null;
  monitorTelegramBotToken: string | null;
  monitorTelegramChatId: string | null;
  companyEmails: string[] | null;
  companyTelegramBotToken: string | null;
  companyTelegramChatId: string | null;
  workspaceEmail: string | null;
  workspaceTelegramBotToken: string | null;
  workspaceTelegramChatId: string | null;
}

export interface ResolvedNotificationRouting {
  emailRecipients: string | null;
  telegramBotToken: string | null;
  telegramChatId: string | null;
}

export async function getMonitorNotificationRouting(userId: string, monitorId: string) {
  const [row] = await db
    .select({
      monitorEmail: monitors.notifEmail,
      monitorTelegramBotToken: monitors.telegramBotToken,
      monitorTelegramChatId: monitors.telegramChatId,
      companyEmails: companies.notificationEmailRecipients,
      companyTelegramBotToken: companies.telegramBotTokenEncrypted,
      companyTelegramChatId: companies.telegramChatId,
      workspaceEmail: userSettings.smtpDefaultToEmail,
      workspaceTelegramBotToken: userSettings.defaultTelegramBotTokenEncrypted,
      workspaceTelegramChatId: userSettings.defaultTelegramChatId,
    })
    .from(monitors)
    .leftJoin(companies, and(
      eq(companies.id, monitors.companyId),
      eq(companies.userId, monitors.userId),
      isNull(companies.deletedAt)
    ))
    .leftJoin(userSettings, eq(userSettings.userId, monitors.userId))
    .where(and(eq(monitors.id, monitorId), eq(monitors.userId, userId)))
    .limit(1);

  if (!row) {
    return null;
  }

  return resolveNotificationRouting({
    ...row,
    monitorTelegramBotToken: decryptValueOrLegacyPlaintext(row.monitorTelegramBotToken),
    companyTelegramBotToken: decryptValueOrLegacyPlaintext(row.companyTelegramBotToken),
    workspaceTelegramBotToken: decryptValueOrLegacyPlaintext(row.workspaceTelegramBotToken),
  });
}

export function resolveNotificationRouting(
  candidates: NotificationRoutingCandidates
): ResolvedNotificationRouting {
  const monitorTelegram = completeTelegramTarget(
    candidates.monitorTelegramBotToken,
    candidates.monitorTelegramChatId
  );
  const companyTelegram = completeTelegramTarget(
    candidates.companyTelegramBotToken,
    candidates.companyTelegramChatId
  );
  const workspaceTelegram = completeTelegramTarget(
    candidates.workspaceTelegramBotToken,
    candidates.workspaceTelegramChatId
  );
  const telegram = monitorTelegram ?? companyTelegram ?? workspaceTelegram;

  return {
    emailRecipients:
      cleanString(candidates.monitorEmail)
      ?? joinCompanyEmails(candidates.companyEmails)
      ?? cleanString(candidates.workspaceEmail),
    telegramBotToken: telegram?.botToken ?? null,
    telegramChatId: telegram?.chatId ?? null,
  };
}

function completeTelegramTarget(botToken: string | null, chatId: string | null) {
  const cleanBotToken = cleanString(botToken);
  const cleanChatId = cleanString(chatId);
  return cleanBotToken && cleanChatId
    ? { botToken: cleanBotToken, chatId: cleanChatId }
    : null;
}

function joinCompanyEmails(recipients: string[] | null) {
  const normalized = (recipients ?? []).map((recipient) => recipient.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized.join(", ") : null;
}

function cleanString(value: string | null) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}
