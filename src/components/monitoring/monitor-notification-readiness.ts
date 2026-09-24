import type { CompanyRecord } from "@/lib/companies/types";
import type { MonitorPayload } from "@/lib/monitors/types";
import type { SettingsPayload } from "@/lib/settings/types";

export function getMonitorNotificationReadiness(
  monitor: MonitorPayload,
  settings: SettingsPayload | null,
  company: CompanyRecord | undefined,
  existingMonitor: boolean,
) {
  if (monitor.notificationPref === "none") return [];

  const emailRecipients = Boolean(
    monitor.notifEmail.trim()
    || company?.notificationEmailRecipients.length
    || settings?.notifications.smtpDefaultToEmail.trim(),
  );
  const emailTransport = Boolean(settings?.notifications.smtpHost.trim() && settings.notifications.smtpFromEmail.trim());
  const telegramDestination = Boolean(
    (monitor.telegramBotToken.trim() && monitor.telegramChatId.trim())
    || (company?.telegramBotTokenConfigured && company.telegramChatId.trim())
    || (settings?.notifications.defaultTelegramBotTokenConfigured && settings.notifications.defaultTelegramChatId.trim()),
  );

  return [
    ...(monitor.notificationPref === "email" || monitor.notificationPref === "both"
      ? [{ channel: "Email", ready: emailTransport && emailRecipients,
          detail: !settings ? "Channel settings are unavailable."
            : !emailTransport ? "SMTP host and sender are missing."
              : !emailRecipients ? "Add a recipient here, at company level, or in workspace settings."
                : "Transport and recipient are configured; send a test to verify delivery." }] : []),
    ...(monitor.notificationPref === "telegram" || monitor.notificationPref === "both"
      ? [{ channel: "Telegram", ready: telegramDestination,
          detail: telegramDestination ? "Bot and chat are configured; send a test to verify delivery."
            : existingMonitor ? "No visible default destination. A saved monitor override may still be configured."
              : "Add a bot and chat here, at company level, or in workspace settings." }] : []),
  ];
}
