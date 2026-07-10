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
    expect(rendered.telegramBody).toContain("Details: Service returned HTTP 500.");
    expect(rendered.telegramBody).toContain("Organization: Sentrovia Monitoring");
  });

  it("renders email and telegram defaults in Turkish when selected", () => {
    const rendered = renderNotificationTemplates(
      buildContext({
        emailSubject: DEFAULT_SETTINGS.notifications.defaultEmailSubjectTemplate,
        emailBody: DEFAULT_SETTINGS.notifications.defaultEmailBodyTemplate,
        telegramTemplate: DEFAULT_SETTINGS.notifications.defaultTelegramTemplate,
      }),
      {
        ...DEFAULT_SETTINGS,
        notifications: {
          ...DEFAULT_SETTINGS.notifications,
          notificationLanguage: "tr",
        },
      },
      "https://sentrovia.example.com"
    );

    expect(rendered.subject).toContain("durumunda");
    expect(rendered.subject).toContain("ERİŞİLEMİYOR");
    expect(rendered.subject).not.toContain("DOWN");
    expect(rendered.textBody).toContain("Monit");
    expect(rendered.textBody).toContain("Durum:");
    expect(rendered.textBody).toContain("Servis HTTP 500 döndürdü.");
    expect(rendered.telegramBody).toContain("Detay: Servis HTTP 500 döndürdü.");
  });

  it("lets monitor language override the workspace notification language", () => {
    const rendered = renderNotificationTemplates(
      buildContext({
        notificationLanguage: "tr",
        emailSubject: DEFAULT_SETTINGS.notifications.defaultEmailSubjectTemplate,
        emailBody: DEFAULT_SETTINGS.notifications.defaultEmailBodyTemplate,
        telegramTemplate: DEFAULT_SETTINGS.notifications.defaultTelegramTemplate,
      }),
      DEFAULT_SETTINGS,
      "https://sentrovia.example.com"
    );

    expect(rendered.subject).toContain("durumunda");
    expect(rendered.textBody).toContain("Durum:");
    expect(rendered.telegramBody).toContain("Kök neden:");
  });

  it("localizes timeout details in Turkish notifications", () => {
    const rendered = renderNotificationTemplates(
      buildContext({ lastErrorMessage: "timeout" }),
      {
        ...DEFAULT_SETTINGS,
        notifications: {
          ...DEFAULT_SETTINGS.notifications,
          notificationLanguage: "tr",
        },
      },
      "https://sentrovia.example.com"
    );

    expect(rendered.textBody).toContain("Servis 60s içinde yanıt vermedi.");
    expect(rendered.telegramBody).toContain("ZAMAN AŞIMI");
  });

  it("uses Turkish defaults when stored templates still contain legacy English defaults", () => {
    const rendered = renderNotificationTemplates(
      buildContext({
        emailSubject: DEFAULT_SETTINGS.notifications.defaultEmailSubjectTemplate,
        emailBody: DEFAULT_SETTINGS.notifications.defaultEmailBodyTemplate,
        telegramTemplate: DEFAULT_SETTINGS.notifications.defaultTelegramTemplate,
      }),
      {
        ...DEFAULT_SETTINGS,
        notifications: {
          ...DEFAULT_SETTINGS.notifications,
          notificationLanguage: "tr",
          defaultEmailSubjectTemplate: DEFAULT_SETTINGS.notifications.defaultEmailSubjectTemplate,
          defaultEmailBodyTemplate: DEFAULT_SETTINGS.notifications.defaultEmailBodyTemplate,
          defaultTelegramTemplate: DEFAULT_SETTINGS.notifications.defaultTelegramTemplate,
        },
      },
      "https://sentrovia.example.com"
    );

    expect(rendered.subject).toContain("ERİŞİLEMİYOR");
    expect(rendered.textBody).toContain("Monitör:");
    expect(rendered.telegramBody).toContain("Kök neden:");
    expect(rendered.telegramBody).not.toContain("Root cause:");
  });

  it("localizes recovery, latency, and downtime reminder notifications in Turkish", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        notificationLanguage: "tr" as const,
      },
    };
    const baseContext = buildContext();

    const recovery = renderNotificationTemplates(
      {
        ...baseContext,
        kind: "recovery",
        message: "Service recovered and is responding again.",
        result: {
          ...baseContext.result,
          ok: true,
          status: "up",
          statusCode: 200,
          errorMessage: null,
          failureReason: null,
        },
      },
      settings,
      "https://sentrovia.example.com"
    );
    const latency = renderNotificationTemplates(
      {
        ...baseContext,
        kind: "latency",
        message: "Service is online but slow: 18000ms exceeded the 10000ms threshold.",
        result: {
          ...baseContext.result,
          ok: true,
          status: "up",
          statusCode: 200,
          latencyMs: 18000,
          errorMessage: null,
          failureReason: null,
        },
        monitor: {
          ...baseContext.monitor,
          slowResponseThresholdMs: 10000,
        },
      },
      settings,
      "https://sentrovia.example.com"
    );
    const reminder = renderNotificationTemplates(
      {
        ...baseContext,
        kind: "downtime-reminder",
        message: "Service has been down for 3h 0m.",
        monitor: {
          ...baseContext.monitor,
          lastFailureAt: new Date("2026-05-13T05:00:00.000Z"),
        },
      },
      settings,
      "https://sentrovia.example.com"
    );

    expect(recovery.subject).toContain("düzeldi");
    expect(recovery.telegramBody).toContain("Servis düzeldi ve yeniden yanıt veriyor.");
    expect(latency.subject).toContain("YAVAŞ");
    expect(latency.textBody).toContain("Servis çalışıyor ancak yavaş");
    expect(reminder.subject).toContain("3h süredir DOWN");
    expect(reminder.telegramBody).toContain("Servis 3s 0dk süredir down.");
  });
});

function buildContext(monitorOverrides: Partial<Monitor> = {}): NotificationContext {
  const failureReason = monitorOverrides.lastErrorMessage === "timeout" ? "timeout" : "http_status";

  return {
    kind: "failure",
    message: failureReason === "timeout" ? "Service did not respond within 60s." : "Service returned HTTP 500.",
    monitor: buildMonitor(monitorOverrides),
    result: {
      ok: false,
      status: "down",
      statusCode: failureReason === "timeout" ? null : 500,
      latencyMs: null,
      errorMessage: failureReason === "timeout" ? "Service did not respond within 60s." : "HTTP 500",
      failureReason,
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
    notificationLanguage: "default",
    notifEmail: "alerts@example.com",
    telegramBotToken: null,
    telegramChatId: null,
    heartbeatToken: null,
    heartbeatLastReceivedAt: null,
    intervalValue: 5,
    intervalUnit: "dk",
    timeout: 5000,
    slowResponseThresholdMs: null,
    slowResponseAlertsEnabled: true,
    expectedStatusCodes: null,
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
