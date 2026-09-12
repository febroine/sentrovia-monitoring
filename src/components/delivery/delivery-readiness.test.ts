import { describe, expect, it } from "vitest";
import { buildDeliveryChannelReadiness } from "@/components/delivery/delivery-readiness";
import type { DeliveryOverview } from "@/lib/delivery/types";

describe("delivery channel readiness", () => {
  it("keeps the four first-run channels in a stable order and reports missing setup", () => {
    const readiness = buildDeliveryChannelReadiness(buildOverview(), null);

    expect(readiness.map((channel) => [channel.channel, channel.status])).toEqual([
      ["email", "missing"],
      ["telegram", "missing"],
      ["discord", "missing"],
      ["webhook", "missing"],
    ]);
  });

  it("distinguishes configured channels with no attempts from configured channels with activity", () => {
    const readiness = buildDeliveryChannelReadiness(buildOverview({
      webhook: { url: "https://hooks.example.com/sentrovia", isActive: true, secretConfigured: false },
      channelHealth: [
        health("email", { totalAttempts: 1, delivered: 1 }),
        health("telegram"),
        health("discord"),
        health("webhook", { totalAttempts: 1, delivered: 1 }),
      ],
    }), {
      smtpHost: "smtp.example.com",
      smtpFromEmail: "alerts@example.com",
      defaultTelegramBotTokenConfigured: true,
      defaultTelegramChatId: "-100123",
      discordEnabled: true,
      discordWebhookUrl: "https://discord.com/api/webhooks/test",
    });

    expect(readiness.map((channel) => channel.status)).toEqual([
      "configured",
      "no-attempts",
      "no-attempts",
      "configured",
    ]);
  });

  it("surfaces the latest failed delivery as an error with a recovery detail", () => {
    const readiness = buildDeliveryChannelReadiness(buildOverview({
      history: [{
        id: "delivery-1",
        monitorId: null,
        channel: "discord",
        kind: "test",
        destination: "discord",
        status: "failed",
        attempts: 1,
        responseCode: 500,
        errorMessage: "Discord returned HTTP 500.",
        createdAt: "2026-09-12T08:00:00.000Z",
        lastAttemptAt: "2026-09-12T08:00:01.000Z",
        nextRetryAt: null,
        deliveredAt: null,
        deadLetteredAt: "2026-09-12T08:00:01.000Z",
        payload: null,
      }],
    }), {
      discordEnabled: true,
      discordWebhookUrl: "https://discord.com/api/webhooks/test",
    });

    expect(readiness.find((channel) => channel.channel === "discord")).toMatchObject({
      status: "error",
      detail: "Discord returned HTTP 500.",
    });
  });
});

function buildOverview(overrides: Partial<DeliveryOverview> = {}): DeliveryOverview {
  return {
    webhook: null,
    history: [],
    summary: {
      delivered: 0,
      failed: 0,
      retrying: 0,
      pendingWebhookRetries: 0,
      pendingRetries: 0,
      deadLettered: 0,
    },
    channelHealth: [
      health("email"),
      health("telegram"),
      health("discord"),
      health("webhook"),
    ],
    pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
    ...overrides,
  };
}

function health(
  channel: "email" | "telegram" | "discord" | "webhook",
  overrides: Partial<DeliveryOverview["channelHealth"][number]> = {},
) {
  return {
    channel,
    totalAttempts: 0,
    delivered: 0,
    failed: 0,
    retrying: 0,
    errorRatePct: null,
    status: "unknown" as const,
    lastAttemptAt: null,
    lastErrorMessage: null,
    ...overrides,
  };
}
