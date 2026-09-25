import type Mail from "nodemailer/lib/mailer";
import http from "node:http";
import https from "node:https";
import type { BrowserContext, Page, Route } from "playwright";
import type { Monitor } from "@/lib/db/schema";
import { env } from "@/lib/env";
import {
  createPinnedLookup,
  isMonitorNetworkHostnameLiteralAllowed,
  normalizeNetworkHostname,
  resolveMonitorNetworkTargetWithTimeout,
  selectResolvedAddress,
  type ResolvedNetworkTarget,
} from "@/lib/security/public-network-target";

const SCREENSHOT_MONITOR_TYPES = new Set(["http", "keyword", "json"]);
const SCREENSHOT_VIEWPORT = { width: 1366, height: 768 };
const SCREENSHOT_TIMEOUT_MS = 12_000;
const SCREENSHOT_NAVIGATION_TIMEOUT_MS = 8_000;
// DNS resolution, browser startup, navigation, and image capture each need part of this budget.
const SCREENSHOT_TOTAL_TIMEOUT_MS = 30_000;
const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;
const SCREENSHOT_JPEG_QUALITY = 70;
const MAX_CONCURRENT_SCREENSHOTS = 3;
const SCREENSHOT_QUEUE_TIMEOUT_MS = 5_000;
const SCREENSHOT_DEADLINE_ERROR = "screenshot capture timed out";
const SCREENSHOT_REDIRECT_PROBE_TIMEOUT_MS = 3_000;
const MAX_SCREENSHOT_REDIRECTS = 10;
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
    return await withScreenshotDeadline(async (signal) => {
      const resolvedTarget = await resolveScreenshotTarget(monitor);
      const approvedTargets = await resolveScreenshotRedirects(monitor, resolvedTarget, signal);
      return withScreenshotSlot(() =>
        captureScreenshotAttachment(monitor, capturedAt, approvedTargets, signal), signal
      );
    });
  } catch (error) {
    const message = isUnresolvedHostnameError(error)
      ? "screenshot target hostname could not be resolved"
      : toScreenshotErrorMessage(error);
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

async function resolveScreenshotRedirects(
  monitor: Monitor,
  initialTarget: ResolvedNetworkTarget,
  signal: AbortSignal
) {
  const approvedTargets = new Map([[initialTarget.hostname, initialTarget]]);
  const redirectLimit = Math.min(MAX_SCREENSHOT_REDIRECTS, Math.max(0, monitor.maxRedirects ?? 0));
  let currentUrl = resolveScreenshotUrl(monitor);

  for (let redirectCount = 0; redirectCount < redirectLimit && !signal.aborted; redirectCount++) {
    const currentHost = normalizeNetworkHostname(new URL(currentUrl).hostname);
    const target = approvedTargets.get(currentHost);
    if (!target) break;

    let redirectUrl: string | null;
    try {
      redirectUrl = await inspectScreenshotRedirect(currentUrl, target, monitor.ignoreSslErrors, signal);
    } catch {
      break;
    }
    if (!redirectUrl) break;

    const parsed = new URL(redirectUrl);
    const hostname = normalizeNetworkHostname(parsed.hostname);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      || parsed.username
      || parsed.password
      || !isMonitorNetworkHostnameLiteralAllowed(hostname, resolvePrivateTargetAccess(monitor))
    ) {
      throw new Error(SCREENSHOT_PUBLIC_TARGET_ERROR);
    }
    if (!approvedTargets.has(hostname)) {
      approvedTargets.set(hostname, await resolveMonitorNetworkTargetWithTimeout(hostname, {
        allowPrivateTargets: resolvePrivateTargetAccess(monitor),
        message: SCREENSHOT_PUBLIC_TARGET_ERROR,
      }, SCREENSHOT_TIMEOUT_MS));
    }
    currentUrl = redirectUrl;
  }

  return [...approvedTargets.values()];
}

function inspectScreenshotRedirect(
  url: string,
  target: ResolvedNetworkTarget,
  ignoreSslErrors: boolean,
  signal: AbortSignal
) {
  return new Promise<string | null>((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;
    let settled = false;
    const request = transport.request(parsed, {
      method: "GET",
      lookup: createPinnedLookup(target),
      rejectUnauthorized: parsed.protocol === "https:" ? !ignoreSslErrors : undefined,
    }, (response) => {
      const location = response.headers.location;
      const status = response.statusCode ?? 0;
      response.destroy();
      try {
        finish(null, location && [301, 302, 303, 307, 308].includes(status)
          ? new URL(location, parsed).toString()
          : null);
      } catch (error) {
        finish(error instanceof Error ? error : new Error("Invalid screenshot redirect location."));
      }
    });
    const timeout = setTimeout(() => request.destroy(new Error("Screenshot redirect probe timed out.")), SCREENSHOT_REDIRECT_PROBE_TIMEOUT_MS);
    const onAbort = () => request.destroy(new Error(SCREENSHOT_DEADLINE_ERROR));
    const finish = (error: Error | null, redirectUrl?: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(redirectUrl ?? null);
    };
    request.on("error", (error) => finish(error));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    else request.end();
  });
}

async function withScreenshotDeadline<T>(task: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(SCREENSHOT_DEADLINE_ERROR));
    }, SCREENSHOT_TOTAL_TIMEOUT_MS);
  });

  try {
    return await Promise.race([task(controller.signal), timeout]);
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
  approvedTargets: ResolvedNetworkTarget[],
  signal: AbortSignal
): Promise<Mail.Attachment | null> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    args: [
      ...CHROMIUM_HEADLESS_ARGS,
      buildHostResolverRule(approvedTargets),
    ],
    headless: true,
    timeout: SCREENSHOT_TIMEOUT_MS,
  });

  let closing: Promise<void> | null = null;
  const closeBrowser = () => closing ??= browser.close().catch(() => undefined);
  const closeOnAbort = () => { void closeBrowser(); };
  signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    if (signal.aborted) {
      throw new Error(SCREENSHOT_DEADLINE_ERROR);
    }
    const context = await browser.newContext({
      ignoreHTTPSErrors: monitor.ignoreSslErrors,
      serviceWorkers: "block",
      viewport: SCREENSHOT_VIEWPORT,
    });
    const screenshotUrl = resolveScreenshotUrl(monitor);
    const page = await createScreenshotPage(context, screenshotUrl, approvedTargets);
    let navigationTimedOut = false;
    try {
      await page.goto(screenshotUrl, {
        waitUntil: "domcontentloaded",
        timeout: SCREENSHOT_NAVIGATION_TIMEOUT_MS,
      });
    } catch (error) {
      if (
        signal.aborted
        || !/page\.goto: Timeout \d+ms exceeded/i.test(toScreenshotErrorMessage(error))
        || !await hasVisibleScreenshotContent(page, approvedTargets)
      ) {
        throw error;
      }
      navigationTimedOut = true;
    }

    const content = await capturePageScreenshot(page, navigationTimedOut, approvedTargets);
    if (!content) {
      return null;
    }

    return buildScreenshotAttachment(monitor, capturedAt, content);
  } finally {
    signal.removeEventListener("abort", closeOnAbort);
    await closeBrowser();
  }
}

async function hasVisibleScreenshotContent(page: Page, approvedTargets: ResolvedNetworkTarget[]) {
  try {
    const url = new URL(page.url());
    if (
      (url.protocol !== "http:" && url.protocol !== "https:")
      || !approvedTargets.some((target) => target.hostname === normalizeNetworkHostname(url.hostname))
    ) return false;

    return await page.evaluate(() => {
      const body = document.body;
      if (!body) return false;
      if (body.innerText.trim().length > 0) return true;
      return [...body.querySelectorAll("img")].some((image) => image.complete && image.naturalWidth > 0);
    });
  } catch {
    return false;
  }
}

async function capturePageScreenshot(
  page: Page,
  navigationTimedOut: boolean,
  approvedTargets: ResolvedNetworkTarget[]
) {
  let content: Buffer;
  if (navigationTimedOut) {
    content = await captureCurrentBrowserFrame(page);
  } else {
    try {
      content = await page.screenshot({
        type: "jpeg",
        quality: SCREENSHOT_JPEG_QUALITY,
        fullPage: false,
        timeout: SCREENSHOT_TIMEOUT_MS,
      });
    } catch (error) {
      if (
        !/page\.screenshot: Timeout \d+ms exceeded/i.test(toScreenshotErrorMessage(error))
        || !await hasVisibleScreenshotContent(page, approvedTargets)
      ) throw error;
      content = await captureCurrentBrowserFrame(page);
    }
  }

  if (content.byteLength > SCREENSHOT_MAX_BYTES) {
    throw new Error(`screenshot exceeded ${SCREENSHOT_MAX_BYTES} bytes`);
  }

  return content;
}

async function captureCurrentBrowserFrame(page: Page) {
  const session = await page.context().newCDPSession(page);
  try {
    const { data } = await session.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: SCREENSHOT_JPEG_QUALITY,
      captureBeyondViewport: false,
    });
    return Buffer.from(data, "base64");
  } finally {
    await session.detach().catch(() => undefined);
  }
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

async function createScreenshotPage(context: BrowserContext, targetUrl: string, approvedTargets: ResolvedNetworkTarget[]) {
  const approvedHosts = new Set(approvedTargets.map((target) => target.hostname));
  await context.route("**/*", (route) => handleScreenshotRoute(route, targetUrl, approvedHosts));
  return createConfiguredScreenshotPage(context);
}

async function createConfiguredScreenshotPage(context: BrowserContext) {
  const page = await context.newPage();
  page.setDefaultTimeout(SCREENSHOT_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(SCREENSHOT_TIMEOUT_MS);
  return page;
}

function handleScreenshotRoute(route: Route, targetUrl: string, approvedHosts: ReadonlySet<string>) {
  const request = route.request();
  let frameUrl: string | null = null;
  try {
    frameUrl = request.frame().url();
  } catch {
    // Navigation requests can be detached from a frame while redirects are in flight.
  }
  if (shouldAllowScreenshotRequest(targetUrl, request.url(), {
    isNavigationRequest: request.isNavigationRequest(),
    redirectedFromUrl: request.redirectedFrom()?.url() ?? null,
    frameUrl,
  }, approvedHosts)) {
    return route.continue();
  }

  return route.abort("blockedbyclient");
}

export function shouldAllowScreenshotRequest(
  targetUrl: string,
  requestUrl: string,
  requestContext: { isNavigationRequest?: boolean; redirectedFromUrl?: string | null; frameUrl?: string | null } = {},
  approvedHosts?: ReadonlySet<string>
) {
  if (isBrowserLocalUrl(requestUrl)) {
    return true;
  }

  if (isSameOrigin(targetUrl, requestUrl)) {
    return true;
  }

  const hosts = approvedHosts ?? getInitialScreenshotHosts(targetUrl);
  if (
    requestContext.frameUrl
    && isSameOrigin(requestContext.frameUrl, requestUrl)
    && isApprovedScreenshotHost(requestUrl, hosts)
  ) {
    return true;
  }
  return isApprovedNavigationRedirect(requestUrl, requestContext, hosts);
}

function isApprovedScreenshotHost(url: string, approvedHosts: ReadonlySet<string>) {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "http:" || parsed.protocol === "https:")
      && approvedHosts.has(normalizeNetworkHostname(parsed.hostname));
  } catch {
    return false;
  }
}

function getInitialScreenshotHosts(targetUrl: string) {
  try {
    return new Set([normalizeNetworkHostname(new URL(targetUrl).hostname)]);
  } catch {
    return new Set<string>();
  }
}

async function withScreenshotSlot<T>(task: () => Promise<T>, signal: AbortSignal) {
  await acquireScreenshotSlot(signal);

  try {
    if (signal.aborted) {
      throw new Error(SCREENSHOT_DEADLINE_ERROR);
    }
    return await task();
  } finally {
    releaseScreenshotSlot();
  }
}

function acquireScreenshotSlot(signal: AbortSignal) {
  if (signal.aborted) {
    return Promise.reject(new Error(SCREENSHOT_DEADLINE_ERROR));
  }
  if (activeScreenshots < MAX_CONCURRENT_SCREENSHOTS) {
    activeScreenshots += 1;
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(entry.timeout);
      removeScreenshotQueueEntry(entry);
      reject(new Error(SCREENSHOT_DEADLINE_ERROR));
    };
    const entry: ScreenshotQueueEntry = {
      resolve: () => {
        signal.removeEventListener("abort", onAbort);
        activeScreenshots += 1;
        resolve();
      },
      timeout: setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        removeScreenshotQueueEntry(entry);
        reject(new Error("screenshot queue timed out"));
      }, SCREENSHOT_QUEUE_TIMEOUT_MS),
    };
    screenshotQueue.push(entry);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

function buildHostResolverRule(targets: ResolvedNetworkTarget[]) {
  const rules = targets.map((target) => {
    const address = selectResolvedAddress(target);
    return `MAP ${target.hostname} ${address.includes(":") ? `[${address}]` : address}`;
  });
  return `--host-resolver-rules=${[...rules, "MAP * ~NOTFOUND"].join(", ")}`;
}

function resolvePrivateTargetAccess(monitor: Monitor) {
  return env.monitorAllowPrivateTargets
    && (monitor as Monitor & { allowPrivateTargets?: boolean }).allowPrivateTargets === true;
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

function isApprovedNavigationRedirect(
  requestUrl: string,
  requestContext: { isNavigationRequest?: boolean; redirectedFromUrl?: string | null },
  approvedHosts: ReadonlySet<string>
) {
  if (!requestContext.isNavigationRequest || !requestContext.redirectedFromUrl) {
    return false;
  }

  try {
    const request = new URL(requestUrl);
    const redirectedFrom = new URL(requestContext.redirectedFromUrl);

    return (
      approvedHosts.has(normalizeNetworkHostname(request.hostname)) &&
      approvedHosts.has(normalizeNetworkHostname(redirectedFrom.hostname)) &&
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
