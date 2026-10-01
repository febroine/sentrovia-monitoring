import { describe, expect, it, vi } from "vitest";
import type { Monitor } from "@/lib/db/schema";
import { calculateScreenshotBudgetMs, calculateScreenshotNavigationTimeoutMs } from "@/lib/monitors/screenshot-timing";
import {
  buildFailureScreenshotAttachment,
  describeScreenshotContext,
  describeScreenshotFailure,
  shouldAllowScreenshotRequest,
  shouldCaptureScreenshot,
} from "@/worker/screenshot";

describe("failure screenshot timing", () => {
  it("waits as long as the monitor timeout within the screenshot bounds", () => {
    expect(calculateScreenshotNavigationTimeoutMs(60_000)).toBe(60_000);
    expect(calculateScreenshotNavigationTimeoutMs(25_000)).toBe(25_000);
    expect(calculateScreenshotNavigationTimeoutMs(120_000)).toBe(60_000);
    expect(calculateScreenshotNavigationTimeoutMs(3_000)).toBe(8_000);
    expect(calculateScreenshotNavigationTimeoutMs(undefined)).toBe(8_000);
  });

  it("reserves setup and capture time on top of navigation", () => {
    expect(calculateScreenshotBudgetMs(8_000)).toBe(30_000);
    expect(calculateScreenshotBudgetMs(60_000)).toBe(82_000);
  });
});

describe("failure screenshot context banner", () => {
  it("shows how long a slow page took to load", () => {
    expect(describeScreenshotContext({ kind: "loaded", durationMs: 41_200, monitorTimeoutMs: 60_000 }, 75_400)).toEqual({
      tone: "warning",
      title: "Page loaded in 41 s (monitor timeout 60 s)",
      detail: "Screenshot taken 75 s after the failed check started",
    });
  });

  it("explains a page that never finished loading", () => {
    expect(describeScreenshotContext({ kind: "timed-out", timeoutMs: 60_000, partial: false }, 4_250).title)
      .toBe("Page did not load within 60 s; the server sent nothing to display");
    expect(describeScreenshotContext({ kind: "timed-out", timeoutMs: 60_000, partial: true }, 4_250).title)
      .toBe("Page was still loading after 60 s; showing what had rendered");
  });

  it("names the browser network error", () => {
    expect(describeScreenshotContext({ kind: "error-page", code: "ERR_CONNECTION_REFUSED" }, 9_500)).toMatchObject({
      tone: "critical",
      title: "Browser could not open the page (ERR_CONNECTION_REFUSED)",
      detail: "Screenshot taken 9.5 s after the failed check started",
    });
  });
});

describe("failure screenshot log messages", () => {
  it("removes Playwright colors and call logs from navigation timeouts", () => {
    const error = new Error(
      'page.goto: Timeout 8000ms exceeded.\nCall log:\n\u001b[2m  - navigating to "https://example.com/", waiting until "domcontentloaded"\u001b[22m\n'
    );

    expect(describeScreenshotFailure(error)).toBe("page did not load within 8.0 s");
  });

  it("keeps the browser network error code", () => {
    expect(describeScreenshotFailure(new Error("page.goto: net::ERR_UNSAFE_PORT at http://example.com:6666/")))
      .toBe("browser could not open the page (ERR_UNSAFE_PORT)");
  });

  it("explains a full screenshot queue", () => {
    expect(describeScreenshotFailure(new Error("screenshot queue timed out")))
      .toBe("too many screenshots were already being captured (queue timed out)");
  });

  it("keeps other messages readable", () => {
    expect(describeScreenshotFailure(new Error("screenshot target is not allowed by the current network safety policy")))
      .toBe("screenshot target is not allowed by the current network safety policy");
  });
});

describe("failure screenshot capture rules", () => {
  it("allows enabled HTTP monitors with email delivery", () => {
    expect(shouldCaptureScreenshot(buildMonitor({ sendOutageScreenshot: true }))).toBe(true);
  });

  it("skips monitors when the setting is disabled", () => {
    expect(shouldCaptureScreenshot(buildMonitor({ sendOutageScreenshot: false }))).toBe(false);
  });

  it("reports when screenshots are skipped because the monitor setting is disabled", async () => {
    const onSkipped = vi.fn();

    await expect(
      buildFailureScreenshotAttachment(
        buildMonitor({ sendOutageScreenshot: false }),
        new Date("2026-05-15T08:00:00.000Z"),
        onSkipped
      )
    ).resolves.toBeNull();

    expect(onSkipped).toHaveBeenCalledWith("screenshot setting is disabled for this monitor");
  });

  it("skips monitor types that do not render web pages", () => {
    expect(shouldCaptureScreenshot(buildMonitor({ monitorType: "ping", sendOutageScreenshot: true }))).toBe(false);
  });

  it("allows enabled HTTP monitors with telegram delivery", () => {
    expect(
      shouldCaptureScreenshot(
        buildMonitor({ notificationPref: "telegram", sendOutageScreenshot: true })
      )
    ).toBe(true);
  });

  it("skips server-local screenshot targets without blocking the alert", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const onSkipped = vi.fn();

    await expect(
      buildFailureScreenshotAttachment(
        buildMonitor({ url: "http://127.0.0.1:3000/admin", sendOutageScreenshot: true }),
        new Date("2026-05-15T08:00:00.000Z"),
        onSkipped
      )
    ).resolves.toBeNull();

    expect(onSkipped).toHaveBeenCalledWith("screenshot target is not allowed by the current network safety policy");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("network safety policy"));
    warn.mockRestore();
  });

  it("skips dotted localhost screenshot targets", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      buildFailureScreenshotAttachment(
        buildMonitor({ url: "http://localhost.:3000/admin", sendOutageScreenshot: true })
      )
    ).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("network safety policy"));
    warn.mockRestore();
  });

  it("skips link-local metadata screenshot targets", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      buildFailureScreenshotAttachment(
        buildMonitor({ url: "http://169.254.169.254/latest/meta-data", sendOutageScreenshot: true })
      )
    ).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("network safety policy"));
    warn.mockRestore();
  });

  it("skips dotted cloud metadata hostnames", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      buildFailureScreenshotAttachment(
        buildMonitor({ url: "http://metadata.google.internal./computeMetadata/v1", sendOutageScreenshot: true })
      )
    ).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("network safety policy"));
    warn.mockRestore();
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

  it("allows same-host protocol upgrade navigation redirects", () => {
    expect(
      shouldAllowScreenshotRequest("http://status.example.com/down", "https://status.example.com/down", {
        isNavigationRequest: true,
        redirectedFromUrl: "http://status.example.com/down",
      })
    ).toBe(true);
  });

  it("allows validated cross-host navigation redirects and assets from the loaded page", () => {
    const approvedHosts = new Set(["status.example.com", "www.example.com"]);
    expect(shouldAllowScreenshotRequest(
      "https://status.example.com/down",
      "https://www.example.com/down",
      { isNavigationRequest: true, redirectedFromUrl: "https://status.example.com/down" },
      approvedHosts
    )).toBe(true);
    expect(shouldAllowScreenshotRequest(
      "https://status.example.com/down",
      "https://www.example.com/script.js",
      {},
      approvedHosts
    )).toBe(false);
    expect(shouldAllowScreenshotRequest(
      "https://status.example.com/down",
      "https://www.example.com/script.js",
      { frameUrl: "https://www.example.com/down" },
      approvedHosts
    )).toBe(true);
    expect(shouldAllowScreenshotRequest(
      "https://status.example.com/down",
      "http://127.0.0.1:8080/admin",
      { frameUrl: "https://www.example.com/down" },
      approvedHosts
    )).toBe(false);
  });

  it("blocks cross-host navigation redirects", () => {
    expect(
      shouldAllowScreenshotRequest("https://status.example.com/down", "http://127.0.0.1:8080/admin", {
        isNavigationRequest: true,
        redirectedFromUrl: "https://status.example.com/down",
      })
    ).toBe(false);
  });

  it("allows browser-local data URLs for inline assets", () => {
    expect(shouldAllowScreenshotRequest("https://status.example.com/down", "data:image/png;base64,AA==")).toBe(true);
  });

  it("allows Chromium error pages after a failed navigation", () => {
    expect(
      shouldAllowScreenshotRequest("https://status.example.com/down", "chrome-error://chromewebdata/")
    ).toBe(true);
  });
});

function buildMonitor(overrides: Partial<Monitor> = {}): Monitor {
  const now = new Date("2026-05-15T08:00:00.000Z");

  return {
    id: "monitor-1",
    workspaceId: "workspace-1",
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
    lastSuccessAt: null,
    lastFailureAt: now,
    sslExpiresAt: null,
    lastErrorMessage: "HTTP 500",
    consecutiveFailures: 3,
    verificationMode: false,
    verificationFailureCount: 0,
    latencyMs: 120,
    notificationPref: "email",
    notificationLanguage: "default",
    notifEmail: "ops@example.com",
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
    retries: 3,
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
    ignoreSslErrors: true,
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
