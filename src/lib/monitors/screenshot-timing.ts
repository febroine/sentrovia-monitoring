const SCREENSHOT_MIN_NAVIGATION_TIMEOUT_MS = 8_000;
const SCREENSHOT_MAX_NAVIGATION_TIMEOUT_MS = 60_000;
// DNS resolution, redirect probes, browser startup, and image capture share this budget on top of navigation.
const SCREENSHOT_SETUP_AND_CAPTURE_BUDGET_MS = 22_000;

// The browser waits as long as the monitor itself did, so a slow page is not reported as unreachable
// by the screenshot alone; the cap keeps the outage notification from waiting indefinitely.
export function calculateScreenshotNavigationTimeoutMs(monitorTimeoutMs: number | null | undefined) {
  const timeoutMs = typeof monitorTimeoutMs === "number" && Number.isFinite(monitorTimeoutMs)
    ? monitorTimeoutMs
    : SCREENSHOT_MIN_NAVIGATION_TIMEOUT_MS;
  return Math.min(SCREENSHOT_MAX_NAVIGATION_TIMEOUT_MS, Math.max(SCREENSHOT_MIN_NAVIGATION_TIMEOUT_MS, timeoutMs));
}

export function calculateScreenshotBudgetMs(monitorTimeoutMs: number | null | undefined) {
  return calculateScreenshotNavigationTimeoutMs(monitorTimeoutMs) + SCREENSHOT_SETUP_AND_CAPTURE_BUDGET_MS;
}
