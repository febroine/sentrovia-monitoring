import type Mail from "nodemailer/lib/mailer";
import type { BrowserContext, Page, Route } from "playwright";
import type { Monitor } from "@/lib/db/schema";
import { env } from "@/lib/env";
import {
  normalizeNetworkHostname,
  resolveMonitorNetworkTargetWithTimeout,
  selectResolvedAddress,
  type ResolvedNetworkTarget,
} from "@/lib/security/public-network-target";

const SCREENSHOT_MONITOR_TYPES = new Set(["http", "keyword", "json"]);
const SCREENSHOT_VIEWPORT = { width: 1366, height: 768 };
const SCREENSHOT_TIMEOUT_MS = 12_000;
const SCREENSHOT_TOTAL_TIMEOUT_MS = 15_000;
const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;
const SCREENSHOT_JPEG_QUALITY = 70;
const MAX_CONCURRENT_SCREENSHOTS = 3;
const SCREENSHOT_QUEUE_TIMEOUT_MS = 5_000;
const CHROMIUM_HEADLESS_ARGS = ["--headless=new", "--disable-gpu"];
const SCREENSHOT_PUBLIC_TARGET_ERROR = "screenshot target is not allowed by the current network safety policy";

let activeScreenshots = 0;
const screenshotQueue: Array<ScreenshotQueueEntry> = [];

type ScreenshotQueueEntry = {
  resolve: () => void;
  timeout: ReturnType<typeof setTimeout>;
};

export async function buildFailureScreenshotAttachment(
  monitor: Monitor,
  capturedAt = new Date(),
  onSkipped?: (reason: string) => void
): Promise<Mail.Attachment | null> {
  const skipReason = getScreenshotSkipReason(monitor);
  if (skipReason) {
    onSkipped?.(skipReason);
    return null;
  }

  try {
    return await withScreenshotDeadline(async () => {
      try {
        const resolvedTarget = await resolveScreenshotTarget(monitor);
        return withScreenshotSlot(() =>
          captureScreenshotAttachment(monitor, capturedAt, resolvedTarget)
        );
      } catch (error) {
        if (isUnresolvedHostnameError(error)) {
          return withScreenshotSlot(() => captureUnavailableScreenshotAttachment(monitor, capturedAt));
        }
        throw error;
      }
    });
  } catch (error) {
    const message = toScreenshotErrorMessage(error);
    onSkipped?.(message);
    console.warn(
      `[sentrovia] Failure screenshot skipped for monitor ${monitor.id}: ${message}`
    );
    return null;
  }
}

export function shouldCaptureScreenshot(monitor: Monitor) {
  return getScreenshotSkipReason(monitor) === null;
}

function getScreenshotSkipReason(monitor: Monitor) {
  if (!monitor.sendOutageScreenshot) {
    return "screenshot setting is disabled for this monitor";
  }

  if (!SCREENSHOT_MONITOR_TYPES.has(monitor.monitorType)) {
    return "monitor type does not support browser screenshots";
  }

  if (monitor.notificationPref !== "email" && monitor.notificationPref !== "telegram" && monitor.notificationPref !== "both") {
    return "monitor notification channel does not support screenshots";
  }

  return null;
}

async function resolveScreenshotTarget(monitor: Monitor) {
  const hostname = parseScreenshotHostname(monitor.url);
  if (!hostname) {
    throw new Error("screenshot target is not a valid URL");
  }

  return resolveMonitorNetworkTargetWithTimeout(hostname, {
    allowPrivateTargets: resolvePrivateTargetAccess(monitor),
    message: SCREENSHOT_PUBLIC_TARGET_ERROR,
  }, SCREENSHOT_TIMEOUT_MS);
}

async function withScreenshotDeadline<T>(task: () => Promise<T>) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("screenshot capture timed out")),
      SCREENSHOT_TOTAL_TIMEOUT_MS
    );
  });

  try {
    return await Promise.race([task(), timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function parseScreenshotHostname(value: string) {
  try {
    const parsed = new URL(stripUrlFragment(value));
    return normalizeNetworkHostname(parsed.hostname);
  } catch {
    return null;
  }
}

async function captureScreenshotAttachment(
  monitor: Monitor,
  capturedAt: Date,
  resolvedTarget: ResolvedNetworkTarget
): Promise<Mail.Attachment | null> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    args: [
      ...CHROMIUM_HEADLESS_ARGS,
      buildHostResolverRule(resolvedTarget),
    ],
    headless: true,
    timeout: SCREENSHOT_TIMEOUT_MS,
  });

  try {
    const context = await browser.newContext({
      ignoreHTTPSErrors: monitor.ignoreSslErrors,
      viewport: SCREENSHOT_VIEWPORT,
    });
    const screenshotUrl = resolveScreenshotUrl(monitor);
    const page = await createScreenshotPage(context, screenshotUrl);

    try {
      await page.goto(screenshotUrl, {
        waitUntil: "domcontentloaded",
        timeout: SCREENSHOT_TIMEOUT_MS,
      });
    } catch {
      await waitForNativeErrorPage(page);
    }

    const content = await capturePageScreenshot(monitor, page);
    if (!content) {
      return null;
    }

    return buildScreenshotAttachment(monitor, capturedAt, content);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function waitForNativeErrorPage(page: Page) {
  await page
    .waitForFunction(() => document.body.innerText.trim().length > 0, undefined, {
      timeout: 2_000,
    })
    .catch(() => undefined);
  await page.waitForTimeout(250).catch(() => undefined);
}

async function capturePageScreenshot(monitor: Monitor, page: Page) {
  const content = await page.screenshot({
    type: "jpeg",
    quality: SCREENSHOT_JPEG_QUALITY,
    fullPage: false,
    timeout: SCREENSHOT_TIMEOUT_MS,
  });

  if (content.byteLength > SCREENSHOT_MAX_BYTES) {
    throw new Error(`screenshot exceeded ${SCREENSHOT_MAX_BYTES} bytes`);
  }

  return content;
}

function buildScreenshotAttachment(
  monitor: Monitor,
  capturedAt: Date,
  content: Buffer
): Mail.Attachment {
  return {
    filename: buildScreenshotFilename(monitor, capturedAt),
    content,
    contentType: "image/jpeg",
  };
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

  return new Promise<void>((resolve, reject) => {
    const entry: ScreenshotQueueEntry = {
      resolve: () => {
        activeScreenshots += 1;
        resolve();
      },
      timeout: setTimeout(() => {
        removeScreenshotQueueEntry(entry);
        reject(new Error("screenshot queue timed out"));
      }, SCREENSHOT_QUEUE_TIMEOUT_MS),
    };
    screenshotQueue.push(entry);
  });
}

function buildHostResolverRule(target: ResolvedNetworkTarget) {
  const address = selectResolvedAddress(target);
  const mappedAddress = address.includes(":") ? `[${address}]` : address;
  return `--host-resolver-rules=MAP ${target.hostname} ${mappedAddress}`;
}

function resolvePrivateTargetAccess(monitor: Monitor) {
  return env.monitorAllowPrivateTargets
    && (monitor as Monitor & { allowPrivateTargets?: boolean }).allowPrivateTargets === true;
}

async function captureUnavailableScreenshotAttachment(monitor: Monitor, capturedAt: Date) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    args: CHROMIUM_HEADLESS_ARGS,
    headless: true,
    timeout: SCREENSHOT_TIMEOUT_MS,
  });

  try {
    const context = await browser.newContext({ viewport: SCREENSHOT_VIEWPORT });
    const page = await context.newPage();
    await page.setContent(renderUnavailableTargetPage(monitor), { waitUntil: "domcontentloaded" });
    const content = await capturePageScreenshot(monitor, page);
    return content ? buildScreenshotAttachment(monitor, capturedAt, content) : null;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

function releaseScreenshotSlot() {
  activeScreenshots = Math.max(0, activeScreenshots - 1);
  const next = screenshotQueue.shift();
  if (next) {
    clearTimeout(next.timeout);
    next.resolve();
  }
}

function removeScreenshotQueueEntry(entry: ScreenshotQueueEntry) {
  const index = screenshotQueue.indexOf(entry);
  if (index >= 0) {
    screenshotQueue.splice(index, 1);
  }
}

function resolveScreenshotUrl(monitor: Monitor) {
  return stripUrlFragment(monitor.url);
}

function stripUrlFragment(value: string) {
  return value.split("#")[0];
}

function isBrowserLocalUrl(value: string) {
  return (
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    value.startsWith("about:") ||
    value.startsWith("chrome-error:")
  );
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

function toScreenshotErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown screenshot error.";
}

function isUnresolvedHostnameError(error: unknown) {
  const code = error instanceof Error && "code" in error ? String(error.code) : "";
  return code === "ENOTFOUND" || code === "EAI_AGAIN";
}

function renderUnavailableTargetPage(monitor: Monitor) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif}
    main{margin:72px auto;max-width:760px;border-top:4px solid #b91c1c;background:#fff;padding:40px}
    h1{margin:0 0 12px;font-size:26px}.target{color:#475569;overflow-wrap:anywhere}
    .status{margin:28px 0 16px;color:#991b1b;font-size:13px;font-weight:700;letter-spacing:.06em}
    p{font-size:16px;line-height:1.6}
  </style></head><body><main><div class="status">SCREENSHOT UNAVAILABLE</div><h1>${escapeHtml(monitor.name)}</h1><p class="target">${escapeHtml(monitor.url)}</p><p>The worker could not resolve this hostname, so no remote page was loaded.</p></main></body></html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
