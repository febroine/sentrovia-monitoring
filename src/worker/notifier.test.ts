import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Monitor } from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import type { NotificationContext } from "@/worker/types";

const mocks = vi.hoisted(() => ({
  buildNotificationWebhookPayload: vi.fn(() => Promise.resolve({ ok: true })),
  hasRecentMonitorEvent: vi.fn(),
  sendChannelWebhookDelivery: vi.fn(),
  sendEmailDelivery: vi.fn(),
  sendTelegramDelivery: vi.fn(),
  sendWebhookDelivery: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    appUrl: "https://sentrovia.example.com",
  },
}));

vi.mock("@/lib/delivery/service", () => ({
  buildNotificationWebhookPayload: mocks.buildNotificationWebhookPayload,
  sendChannelWebhookDelivery: mocks.sendChannelWebhookDelivery,
  sendEmailDelivery: mocks.sendEmailDelivery,
  sendTelegramDelivery: mocks.sendTelegramDelivery,
  sendWebhookDelivery: mocks.sendWebhookDelivery,
}));

vi.mock("@/lib/monitors/service", () => ({
  hasRecentMonitorEvent: mocks.hasRecentMonitorEvent,
}));

vi.mock("@/lib/settings/service", () => ({
  getSettings: () =>
    Promise.resolve({
      ...DEFAULT_SETTINGS,
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        alertDedupMinutes: 15,
        notifyOnRecovery: true,
      },
    }),
}));

vi.mock("@/worker/templates", () => ({
  renderNotificationTemplates: () => ({
    subject: "Recovered",
    textBody: "Recovered",
    htmlBody: "<p>Recovered</p>",
    telegramBody: "Recovered",
  }),
}));

import { sendMonitorNotifications } from "@/worker/notifier";

describe("worker notifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasRecentMonitorEvent.mockResolvedValue(true);
    mocks.sendEmailDelivery.mockResolvedValue(buildDeliveryResult("delivered"));
    mocks.sendTelegramDelivery.mockResolvedValue(buildDeliveryResult("delivered"));
    mocks.sendWebhookDelivery.mockResolvedValue(null);
  });

  it("does not suppress recovery notifications with the generic dedup window", async () => {
    const sent = await sendMonitorNotifications(buildNotificationContext("recovery"));

    expect(sent).toBe(true);
    expect(mocks.hasRecentMonitorEvent).not.toHaveBeenCalled();
    expect(mocks.sendEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "recovery",
        subject: "Recovered",
      })
    );
  });

  it("reports notification as unsent when every attempted delivery fails", async () => {
    mocks.sendEmailDelivery.mockResolvedValue(buildDeliveryResult("failed"));

    const sent = await sendMonitorNotifications(buildNotificationContext("recovery"));

    expect(sent).toBe(false);
    expect(mocks.sendEmailDelivery).toHaveBeenCalled();
    expect(mocks.sendWebhookDelivery).toHaveBeenCalled();
  });

  it("does not suppress down notifications for non-watched status codes", async () => {
    const context = buildNotificationContext("failure");
    context.message = "Service returned HTTP 404.";
    context.result = {
      ...context.result,
      ok: false,
      status: "down",
      statusCode: 404,
      errorMessage: "HTTP 404",
    };

    const sent = await sendMonitorNotifications(context);

    expect(sent).toBe(true);
    expect(mocks.sendEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "failure",
      })
    );
    expect(mocks.hasRecentMonitorEvent).not.toHaveBeenCalled();
  });

  it("does not deduplicate a newly confirmed down notification after recovery", async () => {
    const context = buildNotificationContext("failure");
    context.message = "Service is down again.";
    context.result = {
      ...context.result,
      ok: false,
      status: "down",
      statusCode: 500,
      errorMessage: "HTTP 500",
    };

    const sent = await sendMonitorNotifications(context);

    expect(sent).toBe(true);
    expect(mocks.hasRecentMonitorEvent).not.toHaveBeenCalled();
    expect(mocks.sendEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "failure",
      })
    );
  });

  it("passes screenshot attachments to email delivery", async () => {
    const attachment = {
      filename: "sentrovia-api.jpg",
      content: Buffer.from("image"),
      contentType: "image/jpeg",
    };
    const sent = await sendMonitorNotifications({
      ...buildNotificationContext("failure"),
      emailAttachments: [attachment],
    });

    expect(sent).toBe(true);
    expect(mocks.sendEmailDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "failure",
        attachments: [attachment],
      })
    );
  });

  it("passes lazy email attachments to email delivery without building them in the notifier", async () => {
    const buildEmailAttachments = vi.fn();
    const sent = await sendMonitorNotifications({
      ...buildNotificationContext("failure"),
      buildEmailAttachments,
    });

    expect(sent).toBe(true);
    expect(buildEmailAttachments).not.toHaveBeenCalled();

    const emailInput = mocks.sendEmailDelivery.mock.calls[0]?.[0];
    expect(emailInput).toEqual(expect.objectContaining({ kind: "failure" }));
    expect(emailInput.attachments).toBeUndefined();
    expect(emailInput.buildAttachments).toEqual(expect.any(Function));
  });

  it("passes screenshot attachments to telegram delivery", async () => {
    const attachment = {
      filename: "sentrovia-api.jpg",
      content: Buffer.from("image"),
      contentType: "image/jpeg",
    };
    const context = buildNotificationContext("failure");
    context.monitor = buildMonitor({
      notificationPref: "telegram",
      telegramBotToken: "123456:telegram-token",
      telegramChatId: "-1001234567890",
    });

    const sent = await sendMonitorNotifications({
      ...context,
      emailAttachments: [attachment],
    });

    expect(sent).toBe(true);
    expect(mocks.sendTelegramDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "failure",
        photo: attachment,
      })
    );
  });

  it("passes lazy screenshot attachments to telegram without building them in the notifier", async () => {
    const attachment = {
      filename: "sentrovia-api.jpg",
      content: Buffer.from("image"),
      contentType: "image/jpeg",
    };
    const buildEmailAttachments = vi.fn().mockResolvedValue([attachment]);
    const context = buildNotificationContext("failure");
    context.monitor = buildMonitor({
      notificationPref: "telegram",
      telegramBotToken: "123456:telegram-token",
      telegramChatId: "-1001234567890",
    });

    const sent = await sendMonitorNotifications({
      ...context,
      buildEmailAttachments,
    });

    expect(sent).toBe(true);
    expect(buildEmailAttachments).not.toHaveBeenCalled();

    const telegramInput = mocks.sendTelegramDelivery.mock.calls[0]?.[0];
    expect(telegramInput.photo).toBeUndefined();
    expect(telegramInput.buildPhoto).toEqual(expect.any(Function));
    await expect(telegramInput.buildPhoto()).resolves.toBe(attachment);
  });

  it("does not build lazy email attachments when a notification is suppressed", async () => {
    const buildEmailAttachments = vi.fn();
    const sent = await sendMonitorNotifications({
      ...buildNotificationContext("status-change"),
      buildEmailAttachments,
    });

    expect(sent).toBe(false);
    expect(buildEmailAttachments).not.toHaveBeenCalled();
    expect(mocks.sendEmailDelivery).not.toHaveBeenCalled();
  });
});

function buildDeliveryResult(status: "delivered" | "failed" | "retrying") {
  return { status };
}

function buildNotificationContext(kind: NotificationContext["kind"]): NotificationContext {
  return {
    kind,
    message: "Service recovered.",
    monitor: buildMonitor(),
    result: {
      ok: true,
      status: "up",
      statusCode: 200,
      latencyMs: 80,
      errorMessage: null,
      checkedAt: new Date("2026-05-13T08:00:00.000Z"),
      sslExpiresAt: null,
    },
    rca: {
      type: "healthy",
      title: "Healthy",
      summary: "Service is responding.",
      details: "Service is responding.",
    },
  };
}

function buildMonitor(overrides: Partial<Monitor> = {}): Monitor {
  const now = new Date("2026-05-13T07:55:00.000Z");

  return {
    id: "monitor-1",
    userId: "user-1",
    name: "API",
    monitorType: "http",
    url: "https://api.example.com",
    companyId: null,
    company: null,
    status: "down",
    statusCode: 500,
    uptime: "0%",
    isActive: true,
    lastCheckedAt: now,
    nextCheckAt: now,
    leaseToken: null,
    leaseExpiresAt: null,
    lastSuccessAt: now,
    lastFailureAt: now,
    sslExpiresAt: null,
    lastErrorMessage: "HTTP 500",
    consecutiveFailures: 2,
    verificationMode: false,
    verificationFailureCount: 0,
    latencyMs: 120,
    notificationPref: "email",
    notifEmail: "alerts@example.com",
    telegramBotToken: null,
    telegramChatId: null,
    heartbeatToken: null,
    heartbeatLastReceivedAt: null,
    intervalValue: 5,
    intervalUnit: "dk",
    timeout: 5000,
    retries: 2,
    method: "GET",
    databaseSsl: true,
    databasePasswordEncrypted: null,
    keywordQuery: null,
    keywordInvert: false,
    jsonPath: null,
    jsonExpectedValue: null,
    jsonMatchMode: "equals",
    tags: [],
    renotifyCount: null,
    maxRedirects: 5,
    ipFamily: "auto",
    checkSslExpiry: false,
    ignoreSslErrors: false,
    cacheBuster: false,
    saveErrorPages: false,
    saveSuccessPages: false,
    responseMaxLength: 1024,
    telegramTemplate: null,
    emailSubject: null,
    emailBody: null,
    sendIncidentScreenshot: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
