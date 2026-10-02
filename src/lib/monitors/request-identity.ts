// Monitors identify as a current desktop browser: some firewalls and bot filters stall or reject
// requests without a browser User-Agent, which turned healthy sites into false outages. The trailing
// token lets site owners recognise and allow-list Sentrovia in their logs.
export const MONITOR_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Sentrovia-Monitor";

// Only the identity changes. Headers that steer content negotiation stay neutral, so a server returns
// the same body it did before: preferring text/html made negotiating APIs answer JSON monitors with an
// HTML page, and Accept-Language would localise pages that keyword monitors search in.
// No Accept-Encoding either: bodies are truncated at 100 KB, and a truncated compressed body cannot be
// decoded, which would turn large healthy pages into failures.
export const MONITOR_REQUEST_HEADERS = {
  "User-Agent": MONITOR_USER_AGENT,
  Accept: "*/*",
} as const;
