// Monitors identify as a current desktop browser: some firewalls and bot filters stall or reject
// requests without a browser User-Agent, which turned healthy sites into false outages. The trailing
// token lets site owners recognise and allow-list Sentrovia in their logs.
export const MONITOR_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Sentrovia-Monitor";

export const MONITOR_REQUEST_HEADERS = {
  "User-Agent": MONITOR_USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8",
  "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
  // No Accept-Encoding on purpose: the check truncates bodies at 100 KB, and a truncated
  // compressed body cannot be decoded, which would turn large healthy pages into failures.
} as const;
