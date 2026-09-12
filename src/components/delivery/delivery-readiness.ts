import type { DeliveryChannelHealth, DeliveryHistoryRecord, DeliveryOverview } from "@/lib/delivery/types";

export type DeliveryReadinessStatus = "configured" | "missing" | "error" | "no-attempts";

export interface DeliveryNotificationSettings {
  smtpHost?: string | null;
  smtpFromEmail?: string | null;
  defaultTelegramBotTokenConfigured?: boolean;
  defaultTelegramChatId?: string | null;
  discordWebhookUrl?: string | null;
  discordEnabled?: boolean;
}

export interface DeliveryChannelReadiness {
  channel: DeliveryChannelHealth["channel"];
  label: string;
  status: DeliveryReadinessStatus;
  detail: string;
  href: string;
}

const CHANNELS: Array<{
  channel: DeliveryChannelHealth["channel"];
  label: string;
  href: string;
}> = [
  { channel: "email", label: "Email", href: "/settings#smtp-delivery" },
  { channel: "telegram", label: "Telegram", href: "/settings#additional-notification-channels" },
  { channel: "discord", label: "Discord", href: "/settings#additional-notification-channels" },
  { channel: "webhook", label: "Webhook", href: "/delivery#webhook-setup" },
];

export function buildDeliveryChannelReadiness(
  overview: Pick<DeliveryOverview, "channelHealth" | "history" | "webhook">,
  settings: DeliveryNotificationSettings | null,
): DeliveryChannelReadiness[] {
  return CHANNELS.map(({ channel, label, href }) => {
    const health = overview.channelHealth.find((item) => item.channel === channel);
    const history = overview.history.filter((item) => item.channel === channel);
    const configured = isChannelConfigured(channel, overview.webhook, settings);
    const failedAttempt = findFailedAttempt(health, history);
    const hasAttempts = Boolean(health?.totalAttempts || history.length);

    if (failedAttempt) {
      return {
        channel,
        label,
        href,
        status: "error",
        detail: failedAttempt.errorMessage || "Review the latest failed delivery attempt.",
      };
    }

    if (!configured) {
      return {
        channel,
        label,
        href,
        status: "missing",
        detail: missingConfigurationDetail(channel, overview.webhook),
      };
    }

    if (!hasAttempts) {
      return {
        channel,
        label,
        href,
        status: "no-attempts",
        detail: "Configuration is ready, but no delivery attempts are recorded yet.",
      };
    }

    return {
      channel,
      label,
      href,
      status: "configured",
      detail: `${health?.totalAttempts ?? history.length} delivery attempt${(health?.totalAttempts ?? history.length) === 1 ? "" : "s"} recorded.`,
    };
  });
}

function isChannelConfigured(
  channel: DeliveryChannelHealth["channel"],
  webhook: DeliveryOverview["webhook"],
  settings: DeliveryNotificationSettings | null,
) {
  if (channel === "email") {
    return Boolean(settings?.smtpHost?.trim() && settings.smtpFromEmail?.trim());
  }

  if (channel === "telegram") {
    return Boolean(settings?.defaultTelegramBotTokenConfigured && settings.defaultTelegramChatId?.trim());
  }

  if (channel === "discord") {
    return Boolean(settings?.discordEnabled && settings.discordWebhookUrl?.trim());
  }

  return Boolean(webhook?.url.trim() && webhook.isActive);
}

function findFailedAttempt(
  health: DeliveryChannelHealth | undefined,
  history: DeliveryHistoryRecord[],
) {
  if (health?.status === "unhealthy" || health?.status === "degraded" || health?.failed || health?.lastErrorMessage) {
    return {
      errorMessage: health.lastErrorMessage || "Delivery attempts need attention. Review delivery history.",
    };
  }

  return [...history]
    .filter((item) => item.status === "failed")
    .sort((left, right) => getAttemptTime(right) - getAttemptTime(left))[0] ?? null;
}

function getAttemptTime(item: DeliveryHistoryRecord) {
  const value = item.lastAttemptAt ?? item.createdAt;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function missingConfigurationDetail(
  channel: DeliveryChannelHealth["channel"],
  webhook: DeliveryOverview["webhook"],
) {
  if (channel === "email") return "Add an SMTP host and sender address in Settings.";
  if (channel === "telegram") return "Add a default bot token and chat ID in Settings.";
  if (channel === "discord") return "Enable Discord and add its webhook URL in Settings.";
  if (webhook?.url && !webhook.isActive) return "An endpoint is saved, but it is currently inactive.";
  return "Add an active endpoint before sending webhook alerts.";
}
