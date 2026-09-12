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
    expect(rendered.htmlBody).toContain(">Check site</a>");
    expect(rendered.htmlBody).toContain("Sentrovia monitoring notification");
    expect(rendered.htmlBody).not.toContain("Open monitoring");
    expect(rendered.htmlBody).not.toContain("https://sentrovia.example.com/monitoring");
    expect(rendered.htmlBody).toContain("API");
    expect(rendered.htmlBody).toContain("font-family:'IBM Plex Sans'");
    expect(rendered.htmlBody).toContain('content="light dark"');
    expect(rendered.htmlBody).toContain("@media (prefers-color-scheme:dark)");
    expect(rendered.htmlBody).toContain("[data-ogsc] .email-canvas");
    expect(rendered.htmlBody).not.toMatch(/Arial|Helvetica/);
  });

  it("does not let markdown formatting corrupt links containing underscores", () => {
    const rendered = renderNotificationTemplates(
      buildContext({ url: "https://api.example.com/health_check_now" }),
      DEFAULT_SETTINGS,
      "https://sentrovia.example.com"
    );

    expect(rendered.htmlBody).toContain('href="https://api.example.com/health_check_now"');
    expect(rendered.textBody).toContain("https://api.example.com/health_check_now");
    expect(rendered.telegramBody).toContain("https://api.example.com/health_check_now");
  });

  it("strips paired markdown emphasis without removing literal underscores", () => {
    const rendered = renderNotificationTemplates(
      buildContext({
        emailBody: "Owner: _Platform_team_\nRunbook: health_check_now",
        telegramTemplate: "_Alert_team_: {url}",
        url: "https://api.example.com/health_check_now",
      }),
      DEFAULT_SETTINGS,
      "https://sentrovia.example.com"
    );

    expect(rendered.textBody).toContain("Owner: Platform_team");
    expect(rendered.textBody).toContain("Runbook: health_check_now");
    expect(rendered.telegramBody).toContain("Alert_team: https://api.example.com/health_check_now");
  });

  it("renders custom template content as report rows, sections, lists, and notes", () => {
    const rendered = renderNotificationTemplates(
      buildContext({
        emailBody: "Owner: Platform team\n## Next steps\n- Check the upstream service\nCustom note for the on-call team.",
      }),
      DEFAULT_SETTINGS,
      "https://sentrovia.example.com"
    );

    expect(rendered.htmlBody).toContain(">Owner</td>");
    expect(rendered.htmlBody).toContain(">Platform team</td>");
    expect(rendered.htmlBody).toContain("<h2");
    expect(rendered.htmlBody).toContain("Next steps</h2>");
    expect(rendered.htmlBody).toContain("&bull;&nbsp; Check the upstream service");
    expect(rendered.htmlBody).toContain("Custom note for the on-call team.");
    expect(rendered.textBody).toContain("Owner: Platform team");
  });

  it("uses the configurable notification brand and footer without merging signature text into detail rows", () => {
    const rendered = renderNotificationTemplates(
      buildContext({ emailBody: "Status: Investigating\nIHLAS HOLDING - Bilgi Güvenliği ve Kalite Direktörlüğü" }),
      {
        ...DEFAULT_SETTINGS,
        notifications: {
          ...DEFAULT_SETTINGS.notifications,
          notificationEmailBrandName: "IHLAS HOLDING",
          notificationEmailFooterText: "İhlas altyapı izleme bildirimi",
        },
      },
      "https://sentrovia.example.com"
    );

    expect(rendered.htmlBody).toContain(">IHLAS HOLDING</td>");
    expect(rendered.htmlBody).toContain("İhlas altyapı izleme bildirimi");
    expect(rendered.htmlBody).toContain("margin:16px 0 12px");
  });

  it("renders workspace-configured email headlines for every configurable event", () => {
    const baseContext = buildContext();
    const settings = {
      ...DEFAULT_SETTINGS,
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        defaultEmailHeadlineTemplate: "Alert: {name} cannot be reached",
        recoveryEmailHeadlineTemplate: "Resolved: {name} is healthy",
        slowResponseEmailHeadlineTemplate: "Performance warning for {domain}",
        prolongedDowntimeEmailHeadlineTemplate: "{name} has been unavailable for {downtime_duration}",
        sslExpiryEmailSubjectTemplate: "Certificate warning: {domain}",
        sslExpiryEmailHeadlineTemplate: "Renew {name}'s certificate",
        sslExpiryEmailBodyTemplate: "Certificate: {message}",
        sslExpiryTelegramTemplate: "TLS {domain}: {message}",
      },
    };
    const failure = renderNotificationTemplates(baseContext, settings, "https://sentrovia.example.com");
    const recovery = renderNotificationTemplates(
      { ...baseContext, kind: "recovery", result: { ...baseContext.result, ok: true, status: "up", statusCode: 200 } },
      settings,
      "https://sentrovia.example.com"
    );
    const latency = renderNotificationTemplates(
      { ...baseContext, kind: "latency", result: { ...baseContext.result, ok: true, status: "up", statusCode: 200, latencyMs: 2400 } },
      settings,
      "https://sentrovia.example.com"
    );
    const reminder = renderNotificationTemplates(
      { ...baseContext, kind: "downtime-reminder" },
      settings,
      "https://sentrovia.example.com"
    );
    const sslExpiry = renderNotificationTemplates(
      {
        ...baseContext,
        kind: "ssl-expiry",
        message: "TLS certificate expires in 10 days.",
        result: {
          ...baseContext.result,
          ok: true,
          status: "up",
          statusCode: 200,
          errorMessage: null,
          failureReason: null,
          sslExpiresAt: new Date("2026-05-23T08:00:00.000Z"),
        },
      },
      settings,
      "https://sentrovia.example.com"
    );

    expect(failure.htmlBody).toContain("Alert: API cannot be reached");
    expect(recovery.htmlBody).toContain("Resolved: API is healthy");
    expect(latency.htmlBody).toContain("Performance warning for api.example.com");
    expect(reminder.htmlBody).toContain("API has been unavailable for 5m");
    expect(sslExpiry.subject).toBe("Certificate warning: api.example.com");
    expect(sslExpiry.htmlBody).toContain("Renew API's certificate");
    expect(sslExpiry.textBody).toContain("Certificate: TLS certificate expires in 10 days.");
    expect(sslExpiry.telegramBody).toBe("TLS api.example.com: TLS certificate expires in 10 days.");
  });

  it("uses monitor-level subject, headline, body, and Telegram overrides for every supported event", () => {
    const monitor = {
      emailSubject: "Down subject for {domain}",
      emailHeadline: "Down headline for {name}",
      emailBody: "Down body: {event_state}",
      telegramTemplate: "DOWN Telegram: {domain}",
      recoveryEmailSubject: "Recovery subject for {domain}",
      recoveryEmailHeadline: "Recovery headline for {name}",
      recoveryEmailBody: "Recovery body: {event_state}",
      recoveryTelegramTemplate: "RECOVERY Telegram: {domain}",
      slowResponseEmailSubject: "Slow subject for {domain}",
      slowResponseEmailHeadline: "Slow headline for {name}",
      slowResponseEmailBody: "Slow body: {event_state}",
      slowResponseTelegramTemplate: "SLOW Telegram: {domain}",
      prolongedDowntimeEmailSubject: "Reminder subject for {domain}",
      prolongedDowntimeEmailHeadline: "Reminder headline for {name}",
      prolongedDowntimeEmailBody: "Reminder body: {event_state}",
      prolongedDowntimeTelegramTemplate: "REMINDER Telegram: {domain}",
      sslExpiryEmailSubject: "SSL subject for {domain}",
      sslExpiryEmailHeadline: "SSL headline for {name}",
      sslExpiryEmailBody: "SSL body: {message}",
      sslExpiryTelegramTemplate: "SSL Telegram: {domain}",
    };
    const baseContext = buildContext(monitor);
    const failure = renderNotificationTemplates(baseContext, DEFAULT_SETTINGS, "https://sentrovia.example.com");
    const recovery = renderNotificationTemplates(
      {
        ...baseContext,
        kind: "recovery",
        result: { ...baseContext.result, ok: true, status: "up", statusCode: 200 },
      },
      DEFAULT_SETTINGS,
      "https://sentrovia.example.com"
    );
    const latency = renderNotificationTemplates(
      {
        ...baseContext,
        kind: "latency",
        result: { ...baseContext.result, ok: true, status: "up", statusCode: 200, latencyMs: 2400 },
      },
      DEFAULT_SETTINGS,
      "https://sentrovia.example.com"
    );
    const reminder = renderNotificationTemplates(
      { ...baseContext, kind: "downtime-reminder" },
      DEFAULT_SETTINGS,
      "https://sentrovia.example.com"
    );
    const sslExpiry = renderNotificationTemplates(
      {
        ...baseContext,
        kind: "ssl-expiry",
        message: "TLS certificate expires in 10 days.",
        result: {
          ...baseContext.result,
          ok: true,
          status: "up",
          statusCode: 200,
          errorMessage: null,
          failureReason: null,
          sslExpiresAt: new Date("2026-05-23T08:00:00.000Z"),
        },
      },
      DEFAULT_SETTINGS,
      "https://sentrovia.example.com"
    );

    expect(failure.subject).toBe("Down subject for api.example.com");
    expect(failure.htmlBody).toContain("Down headline for API");
    expect(failure.textBody).toContain("Down body: DOWN");
    expect(failure.telegramBody).toBe("DOWN Telegram: api.example.com");

    expect(recovery.subject).toBe("Recovery subject for api.example.com");
    expect(recovery.htmlBody).toContain("Recovery headline for API");
    expect(recovery.textBody).toContain("Recovery body: UP");
    expect(recovery.telegramBody).toBe("RECOVERY Telegram: api.example.com");

    expect(latency.subject).toBe("Slow subject for api.example.com");
    expect(latency.htmlBody).toContain("Slow headline for API");
    expect(latency.textBody).toContain("Slow body: SLOW");
    expect(latency.telegramBody).toBe("SLOW Telegram: api.example.com");

    expect(reminder.subject).toBe("Reminder subject for api.example.com");
    expect(reminder.htmlBody).toContain("Reminder headline for API");
    expect(reminder.textBody).toContain("Reminder body: DOWN");
    expect(reminder.telegramBody).toBe("REMINDER Telegram: api.example.com");

    expect(sslExpiry.subject).toBe("SSL subject for api.example.com");
    expect(sslExpiry.htmlBody).toContain("SSL headline for API");
    expect(sslExpiry.textBody).toContain("SSL body: TLS certificate expires in 10 days.");
    expect(sslExpiry.telegramBody).toBe("SSL Telegram: api.example.com");
  });

  it("uses a healthy report treatment for recovery emails", () => {
    const context = buildContext();
    const rendered = renderNotificationTemplates(
      {
        ...context,
        kind: "recovery",
        result: { ...context.result, ok: true, status: "up", statusCode: 200 },
      },
      DEFAULT_SETTINGS,
      "https://sentrovia.example.com"
    );

    expect(rendered.htmlBody).toContain("#047857");
    expect(rendered.htmlBody).toContain("UP");
  });

  it("does not render non-http monitor URLs as clickable email links", () => {
    const rendered = renderNotificationTemplates(
      buildContext({ url: "javascript:alert(1)" }),
      DEFAULT_SETTINGS,
      "https://sentrovia.example.com"
    );

    expect(rendered.htmlBody).not.toContain('href="javascript:alert(1)"');
    expect(rendered.htmlBody).toContain("javascript:alert(1)");
    expect(rendered.htmlBody).not.toContain(">Check site</a>");
  });

  it("omits site actions for non-web monitor types", () => {
    const rendered = renderNotificationTemplates(
      buildContext({ monitorType: "tcp", url: "db.internal:5432", name: "Primary database" }),
      DEFAULT_SETTINGS,
      "https://sentrovia.example.com"
    );

    expect(rendered.htmlBody).not.toContain("<a ");
    expect(rendered.htmlBody).not.toContain(">Check site</a>");
    expect(rendered.htmlBody).not.toContain("/monitoring");
    expect(rendered.htmlBody).toContain("db.internal:5432");
  });

  it("uses readable failure reason labels in default emails", () => {
    const rendered = renderNotificationTemplates(
      buildContext(),
      DEFAULT_SETTINGS,
      "https://sentrovia.example.com"
    );

    expect(rendered.textBody).toContain("Failure reason: Unexpected HTTP status");
    expect(rendered.htmlBody).not.toContain(">http_status</td>");
  });

  it("never renders application dashboard links from legacy dashboard placeholders", () => {
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

    expect(rendered.htmlBody).not.toContain("/monitoring");
    expect(rendered.htmlBody).not.toContain("javascript:alert(1)");
    expect(rendered.htmlBody).toContain('href="https://api.example.com/"');
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

  it("uses monitor-specific slow-response templates and keeps the monitor online", () => {
    const baseContext = buildContext({
      status: "up",
      statusCode: 200,
      timeout: 50_000,
      slowResponseThresholdMs: 20_000,
      slowResponseEmailSubject: "Slow {domain}: {latency_ms}/{hard_timeout_ms}",
      slowResponseEmailBody: "State: {event_state}\nResponse: {latency_ms} ms\nThreshold: {slow_threshold_ms} ms",
      slowResponseTelegramTemplate: "SLOW {domain} {latency_ms} ms (limit {slow_threshold_ms} ms)",
    });
    const rendered = renderNotificationTemplates(
      {
        ...baseContext,
        kind: "latency",
        message: "Service is online but slow: 21000ms exceeded the 20000ms threshold.",
        result: {
          ...baseContext.result,
          ok: true,
          status: "up",
          statusCode: 200,
          latencyMs: 21_000,
          errorMessage: null,
          failureReason: null,
        },
      },
      DEFAULT_SETTINGS,
      "https://sentrovia.example.com"
    );

    expect(rendered.subject).toBe("Slow api.example.com: 21000/50000");
    expect(rendered.textBody).toContain("State: SLOW");
    expect(rendered.telegramBody).toBe("SLOW api.example.com 21000 ms (limit 20000 ms)");
    expect(rendered.htmlBody).toContain("Response time");
    expect(rendered.htmlBody).toContain("Performance details");
    expect(rendered.htmlBody).toContain(">Check site</a>");
    expect(rendered.htmlBody).toContain(">SLOW</span>");
  });

  it("labels an early network timeout as check duration beside the configured hard timeout", () => {
    const baseContext = buildContext({ lastErrorMessage: "timeout", timeout: 50_000 });
    const rendered = renderNotificationTemplates(
      {
        ...baseContext,
        message: "A network operation timed out after 19s; the configured hard timeout is 50s.",
        result: {
          ...baseContext.result,
          latencyMs: 19_001,
          errorMessage: "A network operation timed out after 19s; the configured hard timeout is 50s.",
        },
      },
      DEFAULT_SETTINGS,
      "https://sentrovia.example.com"
    );

    expect(rendered.htmlBody).toContain("Check duration");
    expect(rendered.htmlBody).not.toContain("Response time");
    expect(rendered.htmlBody).toContain("19001 ms");
    expect(rendered.htmlBody).toContain("50000 ms");
  });

  it("formats notification timestamps in the workspace time zone", () => {
    const rendered = renderNotificationTemplates(
      buildContext({ emailBody: "Checked: {checked_at_local}" }),
      {
        ...DEFAULT_SETTINGS,
        appearance: {
          ...DEFAULT_SETTINGS.appearance,
          timeZone: "Europe/Istanbul",
          use24HourClock: true,
        },
      },
      "https://sentrovia.example.com"
    );

    expect(rendered.textBody).toContain("Checked: 13.05.2026 11:00:00");
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
    expect(rendered.htmlBody).toContain("Kontrol zamanı");
    expect(rendered.htmlBody).toContain("Sentrovia izleme bildirimi");
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
    expect(latency.subject).toContain("yavaş yanıt veriyor");
    expect(latency.textBody).toContain("Servis çalışıyor ancak yavaş");
    expect(reminder.subject).toContain("3h süredir DOWN");
    expect(reminder.telegramBody).toContain("Servis 3s 0dk süredir down.");
  });

  it("localizes SSL expiry warnings in Turkish", () => {
    const baseContext = buildContext({ checkSslExpiry: true });
    const rendered = renderNotificationTemplates(
      {
        ...baseContext,
        kind: "ssl-expiry",
        message: "TLS certificate expires in 10 days on 2026-05-23.",
        result: {
          ...baseContext.result,
          ok: true,
          status: "up",
          statusCode: 200,
          errorMessage: null,
          failureReason: null,
          sslExpiresAt: new Date("2026-05-23T08:00:00.000Z"),
        },
      },
      {
        ...DEFAULT_SETTINGS,
        notifications: {
          ...DEFAULT_SETTINGS.notifications,
          notificationLanguage: "tr",
        },
      },
      "https://sentrovia.example.com"
    );

    expect(rendered.subject).toContain("SSL SÜRESİ DOLUYOR");
    expect(rendered.textBody).toContain("TLS sertifikasının süresi 2026-05-23 tarihinde, 10 gün içinde dolacak.");
    expect(rendered.htmlBody).toContain("API sertifikasının süresi yaklaşıyor");
    expect(rendered.htmlBody).toContain(">Sertifikayı kontrol et</a>");
    expect(rendered.telegramBody).toContain("TLS sertifikasının süresi 2026-05-23 tarihinde, 10 gün içinde dolacak.");
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
    workspaceId: "workspace-1",
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
    pausedUntil: null,
    publishOnStatusPage: false,
    isFavorite: false,
    isCritical: false,
    deletedAt: null,
    deletedWasActive: null,
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
    heartbeatTokenHash: null,
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
    databaseTlsVerify: true,
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
    emailHeadline: null,
    emailBody: null,
    slowResponseEmailSubject: null,
    slowResponseEmailHeadline: null,
    slowResponseEmailBody: null,
    slowResponseTelegramTemplate: null,
    recoveryEmailSubject: null,
    recoveryEmailHeadline: null,
    recoveryEmailBody: null,
    recoveryTelegramTemplate: null,
    prolongedDowntimeEmailSubject: null,
    prolongedDowntimeEmailHeadline: null,
    prolongedDowntimeEmailBody: null,
    prolongedDowntimeTelegramTemplate: null,
    sslExpiryEmailSubject: null,
    sslExpiryEmailHeadline: null,
    sslExpiryEmailBody: null,
    sslExpiryTelegramTemplate: null,
    sendOutageScreenshot: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
