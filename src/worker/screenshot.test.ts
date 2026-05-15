import { describe, expect, it } from "vitest";
import type { Monitor } from "@/lib/db/schema";
import { shouldAllowScreenshotRequest, shouldCaptureScreenshot } from "@/worker/screenshot";

describe("failure screenshot capture rules", () => {
  it("allows enabled HTTP monitors with email delivery", () => {
    expect(shouldCaptureScreenshot(buildMonitor({ sendIncidentScreenshot: true }))).toBe(true);
  });

  it("skips monitors when the setting is disabled", () => {
    expect(shouldCaptureScreenshot(buildMonitor({ sendIncidentScreenshot: false }))).toBe(false);
  });

  it("skips monitor types that do not render web pages", () => {
    expect(shouldCaptureScreenshot(buildMonitor({ monitorType: "ping", sendIncidentScreenshot: true }))).toBe(false);
  });

  it("skips when the monitor has no email delivery target", () => {
    expect(
      shouldCaptureScreenshot(
        buildMonitor({ notificationPref: "telegram", sendIncidentScreenshot: true })
      )
    ).toBe(false);
  });
});

describe("failure screenshot request isolation", () => {
  it("allows same-origin page assets", () => {
    expect(
      shouldAllowScreenshotRequest("https://status.example.com/down", "https://status.example.com/assets/app.css")
    ).toBe(true);
  });

  it("blocks cross-origin subresources while rendering screenshots", () => {
    expect(
      shouldAllowScreenshotRequest("https://status.example.com/down", "http://127.0.0.1:8080/admin")
    ).toBe(false);
  });

  it("allows browser-local data URLs for inline assets", () => {
    expect(shouldAllowScreenshotRequest("https://status.example.com/down", "data:image/png;base64,AA==")).toBe(true);
  });
});

function buildMonitor(overrides: Partial<Monitor> = {}): Monitor {
  const now = new Date("2026-05-15T08:00:00.000Z");

  return {
    id: "monitor-1",
    userId: "user-1",
    name: "Website",
    monitorType: "http",
    url: "https://example.com",
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
    lastSuccessAt: null,
    lastFailureAt: now,
    sslExpiresAt: null,
    lastErrorMessage: "HTTP 500",
    consecutiveFailures: 3,
    verificationMode: false,
    verificationFailureCount: 0,
    latencyMs: 120,
    notificationPref: "email",
    notifEmail: "ops@example.com",
    telegramBotToken: null,
    telegramChatId: null,
    heartbeatToken: null,
    heartbeatLastReceivedAt: null,
    intervalValue: 5,
    intervalUnit: "dk",
    timeout: 5000,
    retries: 3,
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
    ignoreSslErrors: true,
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
