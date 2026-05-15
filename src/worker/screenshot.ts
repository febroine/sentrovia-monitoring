import type Mail from "nodemailer/lib/mailer";
import type { BrowserContext, Route } from "playwright";
import type { Monitor } from "@/lib/db/schema";

const SCREENSHOT_MONITOR_TYPES = new Set(["http", "keyword", "json"]);
const SCREENSHOT_VIEWPORT = { width: 1366, height: 768 };
const SCREENSHOT_TIMEOUT_MS = 12_000;
const SCREENSHOT_RATE_LIMIT_MS = 30 * 60_000;
const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;
const SCREENSHOT_JPEG_QUALITY = 70;
const MAX_CONCURRENT_SCREENSHOTS = 1;

let activeScreenshots = 0;
const screenshotQueue: Array<() => void> = [];
const lastScreenshotAttemptByMonitor = new Map<string, number>();

export async function buildFailureScreenshotAttachment(
  monitor: Monitor,
  capturedAt = new Date()
): Promise<Mail.Attachment | null> {
  if (!shouldCaptureScreenshot(monitor, capturedAt)) {
    return null;
  }

  lastScreenshotAttemptByMonitor.set(monitor.id, capturedAt.getTime());

  try {
    return await withScreenshotSlot(() => captureScreenshotAttachment(monitor, capturedAt));
  } catch {
    return null;
  }
}

export function shouldCaptureScreenshot(monitor: Monitor, capturedAt = new Date()) {
  if (
    !monitor.sendIncidentScreenshot ||
    !SCREENSHOT_MONITOR_TYPES.has(monitor.monitorType) ||
    (monitor.notificationPref !== "email" && monitor.notificationPref !== "both")
  ) {
    return false;
  }

  pruneScreenshotRateLimit(capturedAt);
  const lastAttemptAt = lastScreenshotAttemptByMonitor.get(monitor.id);
  return !lastAttemptAt || capturedAt.getTime() - lastAttemptAt >= SCREENSHOT_RATE_LIMIT_MS;
}

async function captureScreenshotAttachment(monitor: Monitor, capturedAt: Date): Promise<Mail.Attachment | null> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true, timeout: SCREENSHOT_TIMEOUT_MS });

  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: monitor.ignoreSslErrors,
      viewport: SCREENSHOT_VIEWPORT,
    });
    const screenshotUrl = resolveScreenshotUrl(monitor);
    let page = await createScreenshotPage(context, screenshotUrl);

    try {
      await page.goto(screenshotUrl, {
        waitUntil: "domcontentloaded",
        timeout: SCREENSHOT_TIMEOUT_MS,
      });
    } catch (error) {
      await page.close().catch(() => undefined);
      page = await createScreenshotPage(context, screenshotUrl);
      await page.setContent(buildNavigationFailureHtml(monitor, screenshotUrl, error), {
        waitUntil: "domcontentloaded",
        timeout: SCREENSHOT_TIMEOUT_MS,
      });
    }

    const content = await page.screenshot({
      type: "jpeg",
      quality: SCREENSHOT_JPEG_QUALITY,
      fullPage: false,
      timeout: SCREENSHOT_TIMEOUT_MS,
    });

    if (content.byteLength > SCREENSHOT_MAX_BYTES) {
      return null;
    }

    return {
      filename: buildScreenshotFilename(monitor, capturedAt),
      content,
      contentType: "image/jpeg",
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function createScreenshotPage(context: BrowserContext, targetUrl: string) {
  const page = await context.newPage();
  page.setDefaultTimeout(SCREENSHOT_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(SCREENSHOT_TIMEOUT_MS);
  await page.route("**/*", (route) => handleScreenshotRoute(route, targetUrl));
  return page;
}

function handleScreenshotRoute(route: Route, targetUrl: string) {
  const request = route.request();
  if (
    shouldAllowScreenshotRequest(targetUrl, request.url(), {
      isNavigationRequest: request.isNavigationRequest(),
      redirectedFromUrl: request.redirectedFrom()?.url() ?? null,
    })
  ) {
    void route.continue();
    return;
  }

  void route.abort("blockedbyclient");
}

export function shouldAllowScreenshotRequest(
  targetUrl: string,
  requestUrl: string,
  requestContext: { isNavigationRequest?: boolean; redirectedFromUrl?: string | null } = {}
) {
  if (isBrowserLocalUrl(requestUrl)) {
    return true;
  }

  if (isSameOrigin(targetUrl, requestUrl)) {
    return true;
  }

  return isSameHostNavigationRedirect(targetUrl, requestUrl, requestContext);
}

async function withScreenshotSlot<T>(task: () => Promise<T>) {
  await acquireScreenshotSlot();

  try {
    return await task();
  } finally {
    releaseScreenshotSlot();
  }
}

function acquireScreenshotSlot() {
  if (activeScreenshots < MAX_CONCURRENT_SCREENSHOTS) {
    activeScreenshots += 1;
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    screenshotQueue.push(() => {
      activeScreenshots += 1;
      resolve();
    });
  });
}

function releaseScreenshotSlot() {
  activeScreenshots = Math.max(0, activeScreenshots - 1);
  const next = screenshotQueue.shift();
  if (next) {
    next();
  }
}

function pruneScreenshotRateLimit(now: Date) {
  const cutoff = now.getTime() - SCREENSHOT_RATE_LIMIT_MS;

  for (const [monitorId, attemptedAt] of lastScreenshotAttemptByMonitor.entries()) {
    if (attemptedAt < cutoff) {
      lastScreenshotAttemptByMonitor.delete(monitorId);
    }
  }
}

function resolveScreenshotUrl(monitor: Monitor) {
  return monitor.url.split("#")[0];
}

function isBrowserLocalUrl(value: string) {
  return value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("about:");
}

function isSameOrigin(left: string, right: string) {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

function isSameHostNavigationRedirect(
  targetUrl: string,
  requestUrl: string,
  requestContext: { isNavigationRequest?: boolean; redirectedFromUrl?: string | null }
) {
  if (!requestContext.isNavigationRequest || !requestContext.redirectedFromUrl) {
    return false;
  }

  try {
    const target = new URL(targetUrl);
    const request = new URL(requestUrl);
    const redirectedFrom = new URL(requestContext.redirectedFromUrl);

    return (
      target.hostname === request.hostname &&
      target.hostname === redirectedFrom.hostname &&
      (request.protocol === "http:" || request.protocol === "https:")
    );
  } catch {
    return false;
  }
}

function buildScreenshotFilename(monitor: Monitor, capturedAt: Date) {
  const timestamp = capturedAt.toISOString().replace(/[:.]/g, "-");
  return `sentrovia-${slugify(monitor.name || monitor.url)}-${timestamp}.jpg`;
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || "monitor";
}

function buildNavigationFailureHtml(monitor: Monitor, targetUrl: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Browser navigation failed.";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Sentrovia failure evidence</title>
  <style>
    body { margin: 0; background: #0a0a0a; color: #f5f5f5; font-family: Arial, sans-serif; }
    main { min-height: 100vh; box-sizing: border-box; padding: 48px; display: grid; align-content: center; gap: 18px; }
    .eyebrow { color: #f87171; font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
    h1 { margin: 0; font-size: 34px; line-height: 1.15; }
    dl { display: grid; gap: 12px; max-width: 980px; }
    dt { color: #a3a3a3; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    dd { margin: 4px 0 0; overflow-wrap: anywhere; font-size: 16px; }
    .box { border: 1px solid #333; border-radius: 8px; background: #111; padding: 18px; }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">Sentrovia screenshot evidence</div>
    <h1>The browser could not load the monitored target.</h1>
    <dl>
      <div class="box"><dt>Monitor</dt><dd>${escapeHtml(monitor.name)}</dd></div>
      <div class="box"><dt>Target URL</dt><dd>${escapeHtml(targetUrl)}</dd></div>
      <div class="box"><dt>Navigation error</dt><dd>${escapeHtml(message)}</dd></div>
    </dl>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
