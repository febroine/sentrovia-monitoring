import { describe, expect, it } from "vitest";
import type { Monitor } from "@/lib/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import { renderNotificationTemplates } from "@/worker/templates";
import type { NotificationContext } from "@/worker/types";

describe("notification templates", () => {
  it("keeps valid monitor URLs clickable in email HTML", () => {
    const rendered = renderNotificationTemplates(
      buildContext({ url: "https://api.example.com/health" }),
      DEFAULT_SETTINGS,
      "https://sentrovia.example.com"
    );

    expect(rendered.htmlBody).toContain('href="https://api.example.com/health"');
  });

  it("does not render non-http monitor URLs as clickable email links", () => {
    const rendered = renderNotificationTemplates(
      buildContext({ url: "javascript:alert(1)" }),
      DEFAULT_SETTINGS,
      "https://sentrovia.example.com"
    );

    expect(rendered.htmlBody).not.toContain('href="javascript:alert(1)"');
    expect(rendered.htmlBody).toContain("javascript:alert(1)");
  });

  it("does not render non-http dashboard URLs as clickable email links", () => {
    const rendered = renderNotificationTemplates(
      buildContext(),
      {
        ...DEFAULT_SETTINGS,
        notifications: {
          ...DEFAULT_SETTINGS.notifications,
          defaultEmailBodyTemplate: "Dashboard: {dashboard_link}",
        },
      },
      "javascript:alert(1)"
    );

    expect(rendered.htmlBody).not.toContain('href="javascript:alert(1)/monitoring"');
    expect(rendered.htmlBody).toContain("api.example.com");
  });

  it("renders telegram alerts with the same operational details as email defaults", () => {
    const rendered = renderNotificationTemplates(
      buildContext(),
      DEFAULT_SETTINGS,
      "https://sentrovia.example.com"
    );

    expect(rendered.telegramBody).toContain("Monitor: api.example.com");
    expect(rendered.telegramBody).toContain("Status: 500 -");
    expect(rendered.telegramBody).toContain("Root cause: The service returned an error response.");
    expect(rendered.telegramBody).toContain("Details: Service is unavailable.");
    expect(rendered.telegramBody).toContain("Organization: Sentrovia Monitoring");
  });
});

function buildContext(monitorOverrides: Partial<Monitor> = {}): NotificationContext {
  return {
    kind: "failure",
    message: "Service is unavailable.",
    monitor: buildMonitor(monitorOverrides),
    result: {
      ok: false,
      status: "down",
      statusCode: 500,
      latencyMs: null,
      errorMessage: "HTTP 500",
      checkedAt: new Date("2026-05-13T08:00:00.000Z"),
      sslExpiresAt: null,
    },
    rca: {
      type: "http-server",
      title: "HTTP error",
      summary: "The service returned an error response.",
      details: "The service returned an error response.",
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
