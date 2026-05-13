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
});

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

function buildMonitor(): Monitor {
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
  };
}
