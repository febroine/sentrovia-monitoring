import { env } from "@/lib/env";
import {
  buildNotificationWebhookPayload,
  sendChannelWebhookDelivery,
  sendEmailDelivery,
  sendTelegramDelivery,
  sendWebhookDelivery,
} from "@/lib/delivery/service";
import { hasActiveMaintenanceWindow } from "@/lib/maintenance/service";
import { getSettings } from "@/lib/settings/service";
import type { NotificationContext } from "@/worker/types";
import { renderNotificationTemplates } from "@/worker/templates";

export async function sendMonitorNotifications(context: NotificationContext) {
  if (!(await shouldSendNotification(context))) {
    return;
  }

  const settings = await getSettings(context.monitor.userId);
  if (!settings) {
    return;
  }

  const rendered = renderNotificationTemplates(context, settings, env.appUrl);

  if (context.monitor.notificationPref === "email" || context.monitor.notificationPref === "both") {
    await sendEmailDelivery({
      userId: context.monitor.userId,
      kind: context.kind,
      destinationOverride: context.monitor.notifEmail,
      subject: rendered.subject,
      textBody: rendered.textBody,
      htmlBody: rendered.htmlBody,
    });
  }

  if (context.monitor.notificationPref === "telegram" || context.monitor.notificationPref === "both") {
    await sendTelegramDelivery({
      userId: context.monitor.userId,
      kind: context.kind,
      botToken: context.monitor.telegramBotToken ?? "",
      chatId: context.monitor.telegramChatId ?? "",
      body: rendered.telegramBody,
    });
  }

  if (settings.notifications.slackEnabled && settings.notifications.slackWebhookUrl) {
    await sendChannelWebhookDelivery(context.monitor.userId, "slack", context.kind, rendered.textBody);
  }

  if (settings.notifications.discordEnabled && settings.notifications.discordWebhookUrl) {
    await sendChannelWebhookDelivery(context.monitor.userId, "discord", context.kind, rendered.textBody);
  }

  const webhookPayload = await buildNotificationWebhookPayload({
    userId: context.monitor.userId,
    kind: context.kind,
    monitorName: context.monitor.name,
    url: context.monitor.url,
    status: context.result.status,
    statusCode: context.result.statusCode,
    message: context.message,
    checkedAt: context.result.checkedAt,
    rcaTitle: context.rca.title,
    rcaSummary: context.rca.summary,
  });
  await sendWebhookDelivery(context.monitor.userId, context.kind, webhookPayload);
}

async function shouldSendNotification(context: NotificationContext) {
  if (context.monitor.notificationPref === "none" || context.kind === "check") {
    return false;
  }

  if (await hasActiveMaintenanceWindow(context.monitor.userId, context.result.checkedAt)) {
    return false;
  }

  const settings = await getSettings(context.monitor.userId);
  if (!settings) {
    return false;
  }

  const hasWatchedCodes = settings.notifications.statusCodeAlertCodes.trim().length > 0;
  if (
    hasWatchedCodes &&
    context.result.statusCode !== null &&
    (context.kind === "failure" || context.kind === "status-change") &&
    !matchesWatchedStatusCode(settings.notifications.statusCodeAlertCodes, context.result.statusCode)
  ) {
    return false;
  }

  if (context.kind === "failure") {
    return settings.notifications.notifyOnDown;
  }

  if (context.kind === "recovery") {
    return settings.notifications.notifyOnRecovery;
  }

  if (context.kind === "latency") {
    return settings.notifications.notifyOnLatency;
  }

  if (context.kind === "status-change") {
    return settings.notifications.notifyOnStatusChange;
  }

  return settings.notifications.notifyOnSslExpiry;
}

function matchesWatchedStatusCode(raw: string, statusCode: number | null) {
  if (statusCode === null) {
    return false;
  }

  const watched = new Set(
    raw
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item))
  );

  return watched.size === 0 ? true : watched.has(statusCode);
}
