import { env } from "@/lib/env";
import {
  buildNotificationWebhookPayload,
  sendChannelWebhookDelivery,
  sendEmailDelivery,
  sendTelegramDelivery,
  sendWebhookDelivery,
} from "@/lib/delivery/service";
import { countMonitorEvents, hasRecentMonitorEvent } from "@/lib/monitors/service";
import { getSettings } from "@/lib/settings/service";
import type { NotificationContext } from "@/worker/types";
import { renderNotificationTemplates } from "@/worker/templates";

type NotificationDeliveryResult = { status: string } | null | undefined;
const SSL_EXPIRY_DEDUP_MINUTES = 24 * 60;

export async function sendMonitorNotifications(context: NotificationContext) {
  const decision = await evaluateNotificationDecision(context);
  if (!decision.wouldNotify) {
    return false;
  }

  const settings = await getSettings(context.monitor.userId);
  if (!settings) {
    return false;
  }

  const rendered = renderNotificationTemplates(context, settings, env.appUrl);
  const deliveryResults: NotificationDeliveryResult[] = [];
  const getScreenshotAttachments = createScreenshotAttachmentResolver(context);

  if (context.monitor.notificationPref === "email" || context.monitor.notificationPref === "both") {
    deliveryResults.push(
      await sendEmailDelivery({
        userId: context.monitor.userId,
        kind: context.kind,
        destinationOverride: context.monitor.notifEmail,
        subject: rendered.subject,
        textBody: rendered.textBody,
        htmlBody: rendered.htmlBody,
        attachments: context.emailAttachments,
        buildAttachments: context.emailAttachments ? undefined : getScreenshotAttachments,
      })
    );
  }

  if (context.monitor.notificationPref === "telegram" || context.monitor.notificationPref === "both") {
    deliveryResults.push(
      await sendTelegramDelivery({
        userId: context.monitor.userId,
        kind: context.kind,
        botToken: context.monitor.telegramBotToken ?? "",
        chatId: context.monitor.telegramChatId ?? "",
        body: rendered.telegramBody,
        photo: context.emailAttachments?.[0],
        buildPhoto: context.emailAttachments ? undefined : () => resolveFirstScreenshotAttachment(getScreenshotAttachments),
      })
    );
  }

  if (settings.notifications.discordEnabled && settings.notifications.discordWebhookUrl) {
    deliveryResults.push(
      await sendChannelWebhookDelivery(context.monitor.userId, "discord", context.kind, rendered.textBody)
    );
  }

  const webhookPayload = await buildNotificationWebhookPayload({
    userId: context.monitor.userId,
    kind: context.kind,
    monitorName: context.monitor.name,
    url: context.monitor.url,
    status: context.result.status,
    statusCode: context.result.statusCode,
    failureReason: context.result.failureReason ?? null,
    message: context.message,
    checkedAt: context.result.checkedAt,
    rcaTitle: context.rca.title,
    rcaSummary: context.rca.summary,
  });
  deliveryResults.push(await sendWebhookDelivery(context.monitor.userId, context.kind, webhookPayload));

  return deliveryResults.some(isAcceptedDelivery);
}

function isAcceptedDelivery(result: NotificationDeliveryResult) {
  return result?.status === "delivered" || result?.status === "retrying";
}

function createScreenshotAttachmentResolver(context: NotificationContext) {
  let cached: Promise<NotificationContext["emailAttachments"]> | null = null;

  return () => {
    if (context.emailAttachments) {
      return Promise.resolve(context.emailAttachments);
    }

    if (!context.buildEmailAttachments) {
      return Promise.resolve(undefined);
    }

    cached ??= context.buildEmailAttachments();
    return cached;
  };
}

async function resolveFirstScreenshotAttachment(
  getScreenshotAttachments: () => Promise<NotificationContext["emailAttachments"]>
) {
  const attachments = await getScreenshotAttachments();
  return attachments?.[0] ?? null;
}

export type NotificationDecision = {
  wouldNotify: boolean;
  reason: string;
};

export async function evaluateNotificationDecision(context: NotificationContext): Promise<NotificationDecision> {
  if (context.monitor.notificationPref === "none") {
    return suppress("Notifications are disabled for this monitor.");
  }
  if (context.kind === "check") {
    return suppress("Routine checks do not generate notifications.");
  }

  const settings = await getSettings(context.monitor.userId);
  if (!settings) {
    return suppress("Workspace notification settings are unavailable.");
  }

  const hasWatchedCodes = settings.notifications.statusCodeAlertCodes.trim().length > 0;
  if (
    hasWatchedCodes &&
    context.result.statusCode !== null &&
    context.kind === "status-change" &&
    !matchesWatchedStatusCode(settings.notifications.statusCodeAlertCodes, context.result.statusCode)
  ) {
    return suppress(`HTTP ${context.result.statusCode} is not included in the watched status code list.`);
  }

  if (context.kind === "status-change") {
    return decideByKind(
      settings.notifications.notifyOnStatusChange,
      settings.notifications.alertDedupMinutes,
      context,
      "Status-change notifications are disabled."
    );
  }

  if (context.kind === "latency") {
    return decideByKind(
      settings.notifications.notifyOnLatency && context.monitor.slowResponseAlertsEnabled,
      settings.notifications.alertDedupMinutes,
      context,
      settings.notifications.notifyOnLatency
        ? "Slow-response notifications are disabled for this monitor."
        : "Slow-response notifications are disabled in workspace settings."
    );
  }

  if (context.kind === "ssl-expiry") {
    return decideByKind(
      context.monitor.checkSslExpiry,
      Math.max(settings.notifications.alertDedupMinutes, SSL_EXPIRY_DEDUP_MINUTES),
      context,
      "SSL expiry checks are disabled for this monitor."
    );
  }

  if (context.kind === "failure") {
    if (!settings.notifications.notifyOnDown) {
      return suppress("Confirmed outage notifications are disabled in workspace settings.");
    }
    return (await shouldSendFailureNotification(true, context))
      ? allow("The confirmed failure is eligible for notification.")
      : suppress("A failure notification was already recorded for this outage.");
  }

  if (context.kind === "downtime-reminder") {
    return (await shouldSendDowntimeReminder(settings, context))
      ? allow("The prolonged-downtime reminder is due.")
      : suppress("The prolonged-downtime reminder is disabled, not due, or has reached its limit.");
  }

  if (context.kind === "recovery") {
    return settings.notifications.notifyOnRecovery
      ? allow("Recovery notifications are enabled.")
      : suppress("Recovery notifications are disabled in workspace settings.");
  }

  return suppress("This event type does not generate notifications.");
}

async function decideByKind(
  enabled: boolean,
  dedupMinutes: number,
  context: NotificationContext,
  disabledReason: string
) {
  if (!enabled) {
    return suppress(disabledReason);
  }

  return (await shouldSendByKind(true, dedupMinutes, context))
    ? allow("The event is eligible for notification.")
    : suppress(`A matching notification was recorded within the ${dedupMinutes}-minute deduplication window.`);
}

function allow(reason: string): NotificationDecision {
  return { wouldNotify: true, reason };
}

function suppress(reason: string): NotificationDecision {
  return { wouldNotify: false, reason };
}

async function shouldSendFailureNotification(enabled: boolean, context: NotificationContext) {
  if (!enabled) {
    return false;
  }

  const outageStartedAt = context.monitor.lastFailureAt;
  if (!outageStartedAt) {
    return true;
  }

  return !(await hasRecentMonitorEvent({
    monitorId: context.monitor.id,
    eventType: "failure-notification",
    since: new Date(outageStartedAt),
    before: context.result.checkedAt,
  }));
}

async function shouldSendByKind(enabled: boolean, dedupMinutes: number, context: NotificationContext) {
  if (!enabled) {
    return false;
  }

  if (dedupMinutes <= 0) {
    return true;
  }

  const since = new Date(context.result.checkedAt.getTime() - dedupMinutes * 60 * 1_000);
  return !(await hasRecentMonitorEvent({
    monitorId: context.monitor.id,
    eventType: resolveNotificationMarkerEventType(context.kind),
    since,
    before: context.result.checkedAt,
  }));
}

function resolveNotificationMarkerEventType(kind: NotificationContext["kind"]) {
  if (kind === "latency" || kind === "ssl-expiry" || kind === "status-change") {
    return `${kind}-notification`;
  }

  return kind;
}

async function shouldSendDowntimeReminder(settings: Awaited<ReturnType<typeof getSettings>>, context: NotificationContext) {
  const reminderLimit = context.monitor.renotifyCount ?? 0;
  if (
    !settings?.notifications.prolongedDowntimeEnabled
    || !context.monitor.lastFailureAt
    || reminderLimit <= 0
  ) {
    return false;
  }

  const intervalMinutes = settings.notifications.prolongedDowntimeMinutes;
  const downtimeStartedAt = new Date(context.monitor.lastFailureAt);
  if (Number.isNaN(downtimeStartedAt.getTime())) {
    return false;
  }

  if (context.result.checkedAt.getTime() - downtimeStartedAt.getTime() < intervalMinutes * 60 * 1_000) {
    return false;
  }

  const sentReminderCount = await countMonitorEvents({
    monitorId: context.monitor.id,
    eventType: context.kind,
    since: downtimeStartedAt,
    before: context.result.checkedAt,
  });
  if (sentReminderCount >= reminderLimit) {
    return false;
  }

  const since = new Date(context.result.checkedAt.getTime() - intervalMinutes * 60 * 1_000);
  return !(await hasRecentMonitorEvent({
    monitorId: context.monitor.id,
    eventType: context.kind,
    since,
    before: context.result.checkedAt,
  }));
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
