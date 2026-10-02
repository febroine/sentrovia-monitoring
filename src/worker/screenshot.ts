import type Mail from "nodemailer/lib/mailer";
import http from "node:http";
import https from "node:https";
import type { BrowserContext, Page, Route } from "playwright";
import type { Monitor } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { MONITOR_REQUEST_HEADERS, MONITOR_USER_AGENT } from "@/lib/monitors/request-identity";
import { hasExpectedStatusCodeOverride, isExpectedHttpStatusCode } from "@/lib/monitors/status-codes";
import type { NotificationLanguage } from "@/lib/settings/types";
import {
  calculateScreenshotBudgetMs,
  calculateScreenshotNavigationTimeoutMs,
} from "@/lib/monitors/screenshot-timing";
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
const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;
const SCREENSHOT_JPEG_QUALITY = 70;
const SCREENSHOT_DEADLINE_ERROR = "screenshot capture timed out";
const SCREENSHOT_REDIRECT_PROBE_TIMEOUT_MS = 3_000;
const MAX_SCREENSHOT_REDIRECTS = 10;
const CHROMIUM_HEADLESS_ARGS = ["--headless=new", "--disable-gpu"];
const SCREENSHOT_PUBLIC_TARGET_ERROR = "screenshot target is not allowed by the current network safety policy";
const SCREENSHOT_ERROR_PAGE_RENDER_TIMEOUT_MS = 2_000;
const SCREENSHOT_BANNER_HEIGHT = 64;
const SCREENSHOT_BANNER_TIMEOUT_MS = 5_000;
// Chromium never answers a frame capture for a page it has not painted yet (e.g. a stylesheet still loading).
const SCREENSHOT_FRAME_CAPTURE_TIMEOUT_MS = 5_000;
// Page scripts can keep the renderer's main thread busy, which blocks evaluate() and CDP calls indefinitely.
const SCREENSHOT_PAGE_PROBE_TIMEOUT_MS = 2_000;
// Kept free after navigation for the error page, frame capture, and banner, so the deadline never discards a capture.
const SCREENSHOT_POST_NAVIGATION_RESERVE_MS = 10_000;
const SCREENSHOT_MIN_NAVIGATION_TIMEOUT_MS = 1_000;
// Playwright decorates its messages with ANSI colors and a multi-line call log.
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;]*m/g;
// Only errors caused by the monitored site. Browser policy (ERR_UNSAFE_PORT), the request
// filter (ERR_BLOCKED_BY_CLIENT), and the monitoring host's own network are never captured.
const TARGET_FAILURE_NAVIGATION_ERRORS = new Set([
  "ERR_ADDRESS_UNREACHABLE",
  "ERR_CONNECTION_CLOSED",
  "ERR_CONNECTION_FAILED",
  "ERR_CONNECTION_REFUSED",
  "ERR_CONNECTION_RESET",
  "ERR_CONNECTION_TIMED_OUT",
  "ERR_CONTENT_LENGTH_MISMATCH",
  "ERR_EMPTY_RESPONSE",
  "ERR_HTTP2_PROTOCOL_ERROR",
  "ERR_INCOMPLETE_CHUNKED_ENCODING",
  "ERR_INVALID_HTTP_RESPONSE",
  "ERR_INVALID_RESPONSE",
  "ERR_NAME_NOT_RESOLVED",
  "ERR_RESPONSE_HEADERS_TRUNCATED",
  "ERR_TIMED_OUT",
  "ERR_TOO_MANY_REDIRECTS",
]);

let activeScreenshots = 0;
const screenshotQueue: Array<ScreenshotQueueEntry> = [];

type ScreenshotQueueEntry = {
  resolve: () => void;
  timeout: ReturnType<typeof setTimeout>;
};

// What the browser had on screen when navigation ran out of time.
export type ScreenshotTimedOutRender = "no-response" | "blank" | "partial";

export type ScreenshotNavigationOutcome =
  | { kind: "loaded"; durationMs: number; monitorTimeoutMs: number; statusCode: number | null }
  | { kind: "timed-out"; timeoutMs: number; rendered: ScreenshotTimedOutRender }
  | { kind: "error-page"; code: string };

export type FailureScreenshotOptions = {
  // HTTP status the failed check received (null when it got no response); shown in the banner.
  checkStatusCode?: number | null;
  // Leave the screenshot out when the browser finds the site responding normally: the image
  // would show a working site next to an alert about a failure that has already passed.
  skipWhenSiteResponds?: boolean;
  // Notification language of the alert, so the banner matches the email and Telegram text.
  language?: NotificationLanguage;
};

// Thrown when the capture is deliberately left out; not a capture failure.
class ScreenshotNotNeededError extends Error {}

export async function buildFailureScreenshotAttachment(
  monitor: Monitor,
  capturedAt = new Date(),
  onSkipped?: (reason: string) => void,
  options: FailureScreenshotOptions = {}
): Promise<Mail.Attachment | null> {
  const skipReason = getScreenshotSkipReason(monitor);
  if (skipReason) {
    onSkipped?.(skipReason);
    return null;
  }

  try {
    const budgetMs = calculateScreenshotBudgetMs(monitor.timeout);
    // A capture holds its browser slot for up to its whole budget, so when several sites fail together
    // a queued capture may wait as long. Its own deadline starts once it has a slot, so the wait does
    // not cut its navigation short.
    return await withScreenshotSlot(budgetMs, () => {
      const deadlineAt = Date.now() + budgetMs;
      return withScreenshotDeadline(budgetMs, async (signal) => {
        const approvedTargets = await resolveApprovedScreenshotTargets(monitor, signal);
        return captureScreenshotAttachment(monitor, capturedAt, approvedTargets, signal, deadlineAt, options);
      });
    });
  } catch (error) {
    if (error instanceof ScreenshotNotNeededError) {
      onSkipped?.(error.message);
      console.info(`[sentrovia] Failure screenshot left out for monitor ${monitor.id}: ${error.message}`);
      return null;
    }
    const message = describeScreenshotFailure(error);
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

async function resolveApprovedScreenshotTargets(monitor: Monitor, signal: AbortSignal) {
  let resolvedTarget: ResolvedNetworkTarget;
  try {
    resolvedTarget = await resolveScreenshotTarget(monitor);
  } catch (error) {
    // No approved address: the browser resolves nothing and shows its own DNS error page.
    if (isUnresolvedHostnameError(error)) return [];
    throw error;
  }

  return resolveScreenshotRedirects(monitor, resolvedTarget, signal);
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
      redirectUrl = await inspectScreenshotRedirect(currentUrl, target, monitor, signal);
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
  monitor: Pick<Monitor, "ignoreSslErrors" | "ipFamily">,
  signal: AbortSignal
) {
  return new Promise<string | null>((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;
    let settled = false;
    const request = transport.request(parsed, {
      method: "GET",
      // The browser sends this identity too, so a bot filter answers the probe the way it answers the page.
      headers: MONITOR_REQUEST_HEADERS,
      family: toScreenshotAddressFamily(monitor.ipFamily) ?? undefined,
      lookup: createPinnedLookup(target),
      rejectUnauthorized: parsed.protocol === "https:" ? !monitor.ignoreSslErrors : undefined,
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

async function withScreenshotDeadline<T>(timeoutMs: number, task: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(SCREENSHOT_DEADLINE_ERROR));
    }, timeoutMs);
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
  signal: AbortSignal,
  deadlineAt: number,
  options: FailureScreenshotOptions
): Promise<Mail.Attachment | null> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    // Full Chromium in new headless mode; chrome-headless-shell renders network error pages blank.
    channel: "chromium",
    args: [
      ...CHROMIUM_HEADLESS_ARGS,
      buildHostResolverRule(approvedTargets, toScreenshotAddressFamily(monitor.ipFamily)),
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
      // Same identity as the HTTP check, so both see the page a bot filter serves to that client.
      userAgent: MONITOR_USER_AGENT,
    });
    const screenshotUrl = resolveScreenshotUrl(monitor);
    const page = await createScreenshotPage(context, screenshotUrl, approvedTargets);
    // Queueing and a slow browser start eat into the budget, so navigation gets only what is left of it.
    const navigationTimeoutMs = Math.max(
      SCREENSHOT_MIN_NAVIGATION_TIMEOUT_MS,
      Math.min(
        calculateScreenshotNavigationTimeoutMs(monitor.timeout),
        deadlineAt - Date.now() - SCREENSHOT_POST_NAVIGATION_RESERVE_MS
      )
    );
    const navigationStartedAt = Date.now();
    let outcome: ScreenshotNavigationOutcome;
    // Set only when the failed navigation path already captured the page.
    let screenshot: Buffer | null = null;
    try {
      const response = await page.goto(screenshotUrl, {
        waitUntil: "domcontentloaded",
        timeout: navigationTimeoutMs,
      });
      outcome = {
        kind: "loaded",
        durationMs: Date.now() - navigationStartedAt,
        monitorTimeoutMs: monitor.timeout,
        statusCode: response?.status() ?? null,
      };
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      const message = toScreenshotErrorMessage(error);
      if (/page\.goto: Timeout \d+ms exceeded/i.test(message) && isCapturableTimedOutPage(page, approvedTargets)) {
        // A page that is still loading is the evidence of a slow outage, so it is captured as-is.
        const capture = await captureTimedOutPage(page, approvedTargets);
        outcome = { kind: "timed-out", timeoutMs: navigationTimeoutMs, rendered: capture.rendered };
        screenshot = capture.screenshot;
      } else if (await isShowingTargetNetworkErrorPage(page, message, approvedTargets.length === 0)) {
        outcome = { kind: "error-page", code: extractNetworkErrorCode(message) ?? "ERR_FAILED" };
        screenshot = await capturePageScreenshot(page, approvedTargets);
      } else {
        throw error;
      }
    }

    if (options.skipWhenSiteResponds && outcome.kind === "loaded" && isRespondingNormally(monitor, outcome)) {
      throw new ScreenshotNotNeededError(
        `site was responding normally when the screenshot was taken (HTTP ${outcome.statusCode} in ${formatSeconds(outcome.durationMs)}), so the image would not show the failure`
      );
    }
    const content = await addScreenshotContextBanner(
      context,
      screenshot ?? await capturePageScreenshot(page, approvedTargets),
      describeScreenshotContext(outcome, Date.now() - capturedAt.getTime(), options.checkStatusCode, options.language)
    );
    if (content.byteLength > SCREENSHOT_MAX_BYTES) {
      throw new Error(`screenshot exceeded ${SCREENSHOT_MAX_BYTES} bytes`);
    }

    return buildScreenshotAttachment(monitor, capturedAt, content);
  } finally {
    signal.removeEventListener("abort", closeOnAbort);
    await closeBrowser();
  }
}

function isCapturableTimedOutPage(page: Page, approvedTargets: ResolvedNetworkTarget[]) {
  try {
    const value = page.url();
    if (value === "about:blank") return true;
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:")
      && approvedTargets.some((target) => target.hostname === normalizeNetworkHostname(url.hostname));
  } catch {
    return false;
  }
}

async function hasVisibleScreenshotContent(page: Page, approvedTargets: ResolvedNetworkTarget[]) {
  try {
    const url = new URL(page.url());
    if (
      (url.protocol !== "http:" && url.protocol !== "https:")
      || !approvedTargets.some((target) => target.hostname === normalizeNetworkHostname(url.hostname))
    ) return false;

    return await withTimeout(page.evaluate(() => {
      const body = document.body;
      if (!body) return false;
      if (body.innerText.trim().length > 0) return true;
      return [...body.querySelectorAll("img")].some((image) => image.complete && image.naturalWidth > 0);
    }), SCREENSHOT_PAGE_PROBE_TIMEOUT_MS, "page did not answer the content check");
  } catch {
    return false;
  }
}

// A failed navigation leaves Chromium on its own error page ("This site can't be reached",
// certificate warning, ...). That page is what a visitor sees during the outage, so it is
// captured as-is. Failures caused by this module's own isolation rules are never captured.
async function isShowingTargetNetworkErrorPage(page: Page, message: string, hostnameUnresolved: boolean) {
  const code = extractNetworkErrorCode(message);
  if (!code || !(TARGET_FAILURE_NAVIGATION_ERRORS.has(code) || /^ERR_(CERT|SSL)_/.test(code))) {
    return false;
  }
  if ((code === "ERR_NAME_NOT_RESOLVED") !== hostnameUnresolved) {
    return false;
  }

  try {
    // page.goto rejects before Chromium commits its error page, so wait for it to render.
    await page.waitForURL(/^chrome-error:/, {
      waitUntil: "load",
      timeout: SCREENSHOT_ERROR_PAGE_RENDER_TIMEOUT_MS,
    });
    return await page.evaluate(() => (document.body?.innerText.trim().length ?? 0) > 0);
  } catch {
    return false;
  }
}

async function captureTimedOutPage(
  page: Page,
  approvedTargets: ResolvedNetworkTarget[]
): Promise<{ screenshot: Buffer; rendered: ScreenshotTimedOutRender }> {
  // Like pressing Esc in a browser: pending requests (e.g. a stylesheet that blocks the first paint)
  // are cancelled, so Chromium draws what the server has actually sent. Nothing is generated.
  await stopPageLoading(page);
  const rendered = page.url() === "about:blank"
    ? "no-response"
    : await hasVisibleScreenshotContent(page, approvedTargets) ? "partial" : "blank";
  return { screenshot: await captureCurrentBrowserFrame(page), rendered };
}

async function stopPageLoading(page: Page) {
  try {
    const session = await withTimeout(
      page.context().newCDPSession(page),
      SCREENSHOT_PAGE_PROBE_TIMEOUT_MS,
      "browser did not open a control session"
    );
    try {
      await withTimeout(session.send("Page.stopLoading"), SCREENSHOT_PAGE_PROBE_TIMEOUT_MS, "browser did not stop loading");
    } finally {
      void session.detach().catch(() => undefined);
    }
  } catch {
    // The frame capture below reports a page that cannot be drawn.
  }
}

async function capturePageScreenshot(page: Page, approvedTargets: ResolvedNetworkTarget[]) {
  try {
    return await page.screenshot({
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
    return captureCurrentBrowserFrame(page);
  }
}

// Mirrors the HTTP check: custom expected codes when configured, otherwise a 2xx response.
function isRespondingNormally(
  monitor: Monitor,
  outcome: Extract<ScreenshotNavigationOutcome, { kind: "loaded" }>
) {
  const { statusCode } = outcome;
  if (statusCode === null || outcome.durationMs > monitor.timeout) return false;
  return isExpectedHttpStatusCode(monitor.expectedStatusCodes, statusCode)
    && (hasExpectedStatusCodeOverride(monitor.expectedStatusCodes) || (statusCode >= 200 && statusCode < 300));
}

type BannerDuration = (ms: number) => string;

// Banner wording per notification language. Durations are formatted by the caller for that language.
const BANNER_TEXT = {
  en: {
    loaded: (duration: string, status: number | null, timeout: string) =>
      `Page loaded in ${duration}${status === null ? "" : ` with HTTP ${status}`} (monitor timeout ${timeout})`,
    timedOut: {
      "no-response": (limit: string) => `Page did not load within ${limit}; the server sent nothing, so the browser shows a blank page`,
      blank: (limit: string) => `Page was still loading after ${limit}; nothing visible had arrived yet`,
      partial: (limit: string) => `Page was still loading after ${limit}; showing what had arrived`,
    },
    errorPage: (code: string) => `Browser could not open the page (${code})`,
    check: (status: number | null) => status === null ? "Check got no HTTP response" : `Check got HTTP ${status}`,
    capturedAfter: (elapsed: string) => `Screenshot taken ${elapsed} after the check started`,
  },
  tr: {
    loaded: (duration: string, status: number | null, timeout: string) =>
      `Sayfa ${duration} içinde ${status === null ? "yüklendi" : `HTTP ${status} ile yüklendi`} (monitör zaman aşımı ${timeout})`,
    timedOut: {
      "no-response": (limit: string) => `Sayfa ${limit} içinde yüklenmedi; sunucu hiçbir şey göndermediği için tarayıcı boş sayfa gösteriyor`,
      blank: (limit: string) => `Sayfa ${limit} sonunda hâlâ yükleniyordu; henüz görünür bir içerik gelmemişti`,
      partial: (limit: string) => `Sayfa ${limit} sonunda hâlâ yükleniyordu; o ana kadar gelen içerik gösteriliyor`,
    },
    errorPage: (code: string) => `Tarayıcı sayfayı açamadı (${code})`,
    check: (status: number | null) => status === null ? "Kontrol HTTP yanıtı alamadı" : `Kontrol HTTP ${status} aldı`,
    capturedAfter: (elapsed: string) => `Ekran görüntüsü kontrol başladıktan ${elapsed} sonra alındı`,
  },
} satisfies Record<NotificationLanguage, unknown>;

const BANNER_DURATION: Record<NotificationLanguage, BannerDuration> = {
  en: formatSeconds,
  tr: (ms) => formatSeconds(ms).replace(".", ",").replace(/ s$/, " sn"),
};

export function describeScreenshotContext(
  outcome: ScreenshotNavigationOutcome,
  sinceCheckMs: number,
  checkStatusCode?: number | null,
  language: NotificationLanguage = "en"
) {
  const text = BANNER_TEXT[language] ?? BANNER_TEXT.en;
  const duration = BANNER_DURATION[language] ?? BANNER_DURATION.en;
  // Status-code-change alerts capture a page that is up, so the wording does not assume a failure.
  const detail = [
    checkStatusCode === undefined ? null : text.check(checkStatusCode),
    text.capturedAfter(duration(Math.max(0, sinceCheckMs))),
  ].filter(Boolean).join(" · ");
  if (outcome.kind === "loaded") {
    return {
      tone: outcome.statusCode !== null && outcome.statusCode >= 400 ? "critical" as const : "warning" as const,
      title: text.loaded(duration(outcome.durationMs), outcome.statusCode, duration(outcome.monitorTimeoutMs)),
      detail,
    };
  }
  if (outcome.kind === "timed-out") {
    return {
      tone: "critical" as const,
      title: text.timedOut[outcome.rendered](duration(outcome.timeoutMs)),
      detail,
    };
  }
  return {
    tone: "critical" as const,
    title: text.errorPage(outcome.code),
    detail,
  };
}

// The banner is composed in a separate page so the monitored page is never modified.
async function addScreenshotContextBanner(
  context: BrowserContext,
  image: Buffer,
  banner: ReturnType<typeof describeScreenshotContext>
) {
  let page: Page | null = null;
  try {
    page = await context.newPage();
    await page.setViewportSize({
      width: SCREENSHOT_VIEWPORT.width,
      height: SCREENSHOT_VIEWPORT.height + SCREENSHOT_BANNER_HEIGHT,
    });
    await page.setContent(buildScreenshotBannerHtml(image, banner), {
      waitUntil: "load",
      timeout: SCREENSHOT_BANNER_TIMEOUT_MS,
    });
    return await page.screenshot({
      type: "jpeg",
      quality: SCREENSHOT_JPEG_QUALITY,
      fullPage: false,
      timeout: SCREENSHOT_BANNER_TIMEOUT_MS,
    });
  } catch (error) {
    console.warn(`[sentrovia] Screenshot context banner skipped: ${describeScreenshotFailure(error)}`);
    return image;
  } finally {
    await page?.close().catch(() => undefined);
  }
}

function buildScreenshotBannerHtml(image: Buffer, banner: ReturnType<typeof describeScreenshotContext>) {
  const accent = banner.tone === "critical" ? "#ef4444" : "#f59e0b";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#111827;}
.banner{box-sizing:border-box;height:${SCREENSHOT_BANNER_HEIGHT}px;padding:10px 16px;border-left:6px solid ${accent};
font-family:Arial,Helvetica,sans-serif;color:#f9fafb;display:flex;flex-direction:column;justify-content:center;gap:4px;}
.title{font-size:17px;font-weight:700;}
.detail{font-size:13px;color:#d1d5db;}
img{display:block;width:${SCREENSHOT_VIEWPORT.width}px;height:${SCREENSHOT_VIEWPORT.height}px;}
</style></head><body><div class="banner"><div class="title">${escapeHtml(banner.title)}</div>`
    + `<div class="detail">${escapeHtml(banner.detail)}</div></div>`
    + `<img alt="" src="data:image/jpeg;base64,${image.toString("base64")}"></body></html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatSeconds(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`;
}

async function captureCurrentBrowserFrame(page: Page) {
  const session = await withTimeout(
    page.context().newCDPSession(page),
    SCREENSHOT_PAGE_PROBE_TIMEOUT_MS,
    "browser did not open a capture session"
  );
  try {
    const { data } = await withTimeout(session.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: SCREENSHOT_JPEG_QUALITY,
      captureBeyondViewport: false,
    }), SCREENSHOT_FRAME_CAPTURE_TIMEOUT_MS, "browser could not draw the page (its scripts may be keeping it busy)");
    return Buffer.from(data, "base64");
  } finally {
    // A busy page never acknowledges the detach; closing the browser releases the session anyway.
    void session.detach().catch(() => undefined);
  }
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, message: string) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
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

async function withScreenshotSlot<T>(queueTimeoutMs: number, task: () => Promise<T>) {
  await acquireScreenshotSlot(queueTimeoutMs);

  try {
    return await task();
  } finally {
    releaseScreenshotSlot();
  }
}

function acquireScreenshotSlot(queueTimeoutMs: number) {
  if (activeScreenshots < env.screenshotConcurrency) {
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
      }, queueTimeoutMs),
    };
    screenshotQueue.push(entry);
  });
}

// The browser reaches the site over the same IP family as the check; otherwise an outage on one
// family would be photographed over the other and look like a working site.
function buildHostResolverRule(targets: ResolvedNetworkTarget[], family: 4 | 6 | null) {
  const rules = targets.map((target) => {
    const address = selectResolvedAddress(target, family);
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

function toScreenshotAddressFamily(ipFamily: Monitor["ipFamily"]) {
  if (ipFamily === "ipv4") return 4;
  if (ipFamily === "ipv6") return 6;
  return null;
}

function resolveScreenshotUrl(monitor: Monitor) {
  const url = stripUrlFragment(monitor.url);
  if (!monitor.cacheBuster) return url;
  // Same cache-busting parameter as the HTTP check, so a CDN cannot serve the browser a cached
  // copy of a page whose origin the check found down.
  const parsed = new URL(url);
  parsed.searchParams.set("_monitor_ts", String(Date.now()));
  return parsed.toString();
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

function extractNetworkErrorCode(message: string) {
  return /net::(ERR_[A-Z0-9_]+)/.exec(message)?.[1] ?? null;
}

// Turns raw Playwright errors into a single readable line for the monitor log.
export function describeScreenshotFailure(error: unknown) {
  // The first line carries the reason; Playwright appends call logs and install banners below it.
  const message = toScreenshotErrorMessage(error)
    .replace(ANSI_ESCAPE_PATTERN, "")
    .split(/\s*Call log:/i)[0]
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "";

  const timeout = /^(page\.goto|page\.screenshot|browserType\.launch)\b.*?Timeout (\d+)ms exceeded/i.exec(message);
  if (timeout) {
    const limit = formatSeconds(Number(timeout[2]));
    if (timeout[1] === "page.goto") return `page did not load within ${limit}`;
    if (timeout[1] === "page.screenshot") return `browser could not capture the page within ${limit}`;
    return `browser did not start within ${limit}`;
  }

  const networkCode = extractNetworkErrorCode(message);
  if (networkCode) {
    return `browser could not open the page (${networkCode})`;
  }
  if (/^browserType\.launch/i.test(message)) {
    return `browser could not be started: ${message.replace(/^browserType\.launch:\s*/i, "")}`;
  }
  if (message === "screenshot queue timed out") {
    return "too many screenshots were already being captured (queue timed out)";
  }

  return message || "Unknown screenshot error.";
}

function isUnresolvedHostnameError(error: unknown) {
  const code = error instanceof Error && "code" in error ? String(error.code) : "";
  return code === "ENOTFOUND" || code === "EAI_AGAIN";
}
