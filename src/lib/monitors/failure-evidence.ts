// What a failed HTTP check saw, recorded at the moment it failed: where it connected, how long each
// step took, where it stopped, and what the server answered. Request headers, cookies and anything
// that looks like a credential are never recorded.

export type FailureEvidencePhase = "dns" | "connect" | "tls" | "first-byte" | "body" | "response";

export type FailureEvidenceTimings = {
  dnsMs: number | null;
  connectMs: number | null;
  tlsMs: number | null;
  firstByteMs: number | null;
  totalMs: number | null;
};

export type FailureEvidenceHop = {
  url: string;
  method: string;
  statusCode: number | null;
  remoteAddress: string | null;
  remotePort: number | null;
  reusedConnection: boolean;
  timings: FailureEvidenceTimings;
  headers: Record<string, string>;
};

export type FailureEvidenceCertificate = {
  subject: string | null;
  issuer: string | null;
  validFrom: string | null;
  validTo: string | null;
  protocol: string | null;
};

export type FailureEvidence = {
  version: 1;
  // The step the request was in when it failed; "response" means a response arrived and was rejected.
  phase: FailureEvidencePhase;
  hops: FailureEvidenceHop[];
  certificate: FailureEvidenceCertificate | null;
  body: { contentType: string | null; excerpt: string; truncated: boolean } | null;
  error: string | null;
};

export const FAILURE_EVIDENCE_BODY_LIMIT = 2_000;
const MAX_HEADER_VALUE_LENGTH = 200;
const MAX_URL_LENGTH = 500;
const MAX_ERROR_LENGTH = 500;
const MAX_SUMMARY_HEADER_LENGTH = 60;

// Headers that explain who answered and why, without identifying a visitor.
const RECORDED_RESPONSE_HEADERS = [
  "server",
  "content-type",
  "content-length",
  "location",
  "retry-after",
  "cf-ray",
  "cf-cache-status",
  "x-cache",
  "via",
  "x-served-by",
  "x-request-id",
  "x-amz-cf-id",
  "x-amz-cf-pop",
  "age",
] as const;

// Query parameters are matched broadly; a hidden harmless value costs little in a URL.
const SENSITIVE_KEY = /pass(word|wd)?|secret|token|api[-_]?key|access[-_]?key|auth|session|cookie|signature|sig|credential|private[-_]?key|otp|code/i;
// Body keys are matched narrowly so error details such as "error_code" stay readable.
const SENSITIVE_BODY_KEY = /pass(word|wd)?|secret|token|api[-_]?key|access[-_]?key|session|cookie|signature|credential|private[-_]?key|authorization/i;
const CACHE_BUSTER_PARAM = "_monitor_ts";
const REDACTED = "[redacted]";
const RELATIVE_URL_BASE = "http://relative.invalid";

export function pickRecordedHeaders(headers: Record<string, string | string[] | number | undefined>) {
  const recorded: Record<string, string> = {};
  for (const name of RECORDED_RESPONSE_HEADERS) {
    const raw = headers[name];
    if (raw === undefined) continue;
    const value = Array.isArray(raw) ? raw.join(", ") : String(raw);
    recorded[name] = truncate(name === "location" ? redactUrl(value) : value, MAX_HEADER_VALUE_LENGTH);
  }
  return recorded;
}

// Drops credentials and the cache-busting parameter, and hides values of secret-looking parameters.
export function redactUrl(value: string) {
  const isAbsolute = /^[a-z][a-z\d+.-]*:/i.test(value);
  const isProtocolRelative = value.startsWith("//");
  try {
    const parsed = new URL(value, RELATIVE_URL_BASE);
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    parsed.searchParams.delete(CACHE_BUSTER_PARAM);
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_KEY.test(key)) parsed.searchParams.set(key, REDACTED);
    }
    // A relative redirect target stays relative.
    const redacted = isAbsolute
      ? parsed.toString()
      : `${isProtocolRelative ? `//${parsed.host}` : ""}${parsed.pathname}${parsed.search}`;
    return truncate(redacted, MAX_URL_LENGTH);
  } catch {
    return truncate(value.split("?")[0], MAX_URL_LENGTH);
  }
}

// Only this much of the body is turned into text and scanned for secrets; the excerpt keeps far less.
// Bounding the input keeps the work per failed check small whatever the server sends.
const MAX_SCANNED_BODY_LENGTH = 64_000;
const MAX_SCANNED_TEXT_LENGTH = 8_000;

// A readable, secret-free excerpt of the response body. Markup, scripts and styles are removed so the
// excerpt shows what a visitor would read (e.g. "502 Bad Gateway"); binary bodies are left out.
export function buildBodyExcerpt(bodyText: string, contentType: string | null) {
  if (!bodyText || !isTextContentType(contentType) || looksBinary(bodyText)) return null;

  const body = bodyText.slice(0, MAX_SCANNED_BODY_LENGTH);
  const isHtml = /html|xml/i.test(contentType ?? "") || /^\s*</.test(body);
  const readable = isHtml ? htmlToText(body) : body;
  const scanned = readable.slice(0, MAX_SCANNED_TEXT_LENGTH);
  const normalized = redactSecrets(scanned)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  if (!normalized) return null;

  return {
    contentType,
    excerpt: normalized.slice(0, FAILURE_EVIDENCE_BODY_LIMIT),
    truncated: normalized.length > FAILURE_EVIDENCE_BODY_LIMIT || readable.length > MAX_SCANNED_TEXT_LENGTH
      || bodyText.length > MAX_SCANNED_BODY_LENGTH,
  };
}

const SENSITIVE_WORD = "pass(?:word|wd)?|secret|token|api[-_]?key|access[-_]?key|session|signature|credential|private[-_]?key";

// Every rule is linear in its input: no nested or lookahead-driven repetition.
export function redactSecrets(text: string) {
  return text
    // JSON style: "token": "value", "password": 1234
    .replace(/("[^"\n]{0,60}"\s*:\s*)("[^"\n]*"|-?\d[\d.eE+-]*|true|false)/g, (match, prefix: string) =>
      SENSITIVE_BODY_KEY.test(prefix) ? `${prefix}"${REDACTED}"` : match)
    // key=value, key: value, key = "value", KEY='value'
    .replace(new RegExp(`\\b([\\w.-]{0,40}(?:${SENSITIVE_WORD})[\\w.-]{0,20})(\\s*[=:]\\s*)(["']?)[^\\s"'&,;<>]+\\3`, "gi"),
      (_match, key: string, separator: string, quote: string) => `${key}${separator}${quote}${REDACTED}${quote}`)
    // Authorization values, including Basic credentials echoed by debug pages
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, (_match, scheme: string) => `${scheme} ${REDACTED}`)
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, REDACTED)
    // Hex keys and hashes
    .replace(/\b[0-9a-fA-F]{32,}\b/g, (match) => (/\d/.test(match) ? REDACTED : match))
    // Base64 or URL-safe tokens: long, mixed case and with digits. Paths and words are kept.
    .replace(/[A-Za-z0-9+/_-]{40,}={0,2}/g, (match) =>
      /\d/.test(match) && /[a-z]/.test(match) && /[A-Z]/.test(match) ? REDACTED : match);
}

export function truncateEvidenceError(message: string | null) {
  return message ? truncate(message, MAX_ERROR_LENGTH) : null;
}

// A body without a content type may still be an image or archive.
function looksBinary(bodyText: string) {
  const sample = bodyText.slice(0, 512);
  const unreadable = sample.match(/[\u0000-\u0008\u000e-\u001f\ufffd]/g)?.length ?? 0;
  return unreadable > sample.length * 0.05;
}

function isTextContentType(contentType: string | null) {
  if (!contentType) return true;
  // Any text/* type, or a structured type such as application/problem+json or image/svg+xml.
  return /^text\//i.test(contentType)
    || /(?:json|xml|html|javascript|x-www-form-urlencoded|problem)/i.test(contentType);
}

function htmlToText(html: string) {
  // One pass, so a decoded "&" never starts another entity ("&amp;lt;" stays "&lt;").
  return removeMarkup(html).replace(/&(?:(nbsp|amp|lt|gt|quot|apos)|#(\d{1,7})|#x([0-9a-f]{1,6}));/gi, (
    match,
    name: string | undefined,
    decimal: string | undefined,
    hex: string | undefined
  ) => {
    if (decimal) return safeCharacter(Number(decimal));
    if (hex) return safeCharacter(Number.parseInt(hex, 16));
    return NAMED_ENTITIES[name!.toLowerCase()] ?? match;
  });
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
};

const HIDDEN_ELEMENTS = /^<(script|style|noscript|template|svg)\b/;
const LINE_BREAK_TAGS = /^<(br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/title)\b/;

// A single forward scan: regular expressions over markup rescan the rest of the body from every
// unmatched "<", which takes seconds on a large malformed page.
function removeMarkup(html: string) {
  const lower = html.toLowerCase();
  let output = "";
  let index = 0;
  let nextClose = -1;

  while (index < html.length) {
    const open = html.indexOf("<", index);
    if (open === -1) {
      output += html.slice(index);
      break;
    }
    output += html.slice(index, open);

    if (lower.startsWith("<!--", open)) {
      const end = lower.indexOf("-->", open + 4);
      if (end === -1) break;
      output += " ";
      index = end + 3;
      continue;
    }

    const hidden = HIDDEN_ELEMENTS.exec(lower.slice(open, open + 10));
    if (hidden) {
      const closing = lower.indexOf(`</${hidden[1]}`, open);
      if (closing === -1) break;
      const end = lower.indexOf(">", closing);
      output += " ";
      index = end === -1 ? html.length : end + 1;
      continue;
    }

    if (nextClose < open) nextClose = html.indexOf(">", open);
    if (nextClose === -1) {
      output += html.slice(open);
      break;
    }
    const nextOpen = html.indexOf("<", open + 1);
    if (nextOpen !== -1 && nextOpen < nextClose) {
      // A lone "<" in text, not a tag.
      output += "<";
      index = open + 1;
      continue;
    }

    output += LINE_BREAK_TAGS.test(lower.slice(open, open + 8)) ? "\n" : " ";
    index = nextClose + 1;
  }

  return output;
}

function safeCharacter(code: number) {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
}

function truncate(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

// Accepts only well-formed evidence, so a malformed row never breaks the panel.
export function parseFailureEvidence(value: unknown): FailureEvidence | null {
  if (!value || typeof value !== "object") return null;
  const evidence = value as Partial<FailureEvidence>;
  if (evidence.version !== 1 || !Array.isArray(evidence.hops) || typeof evidence.phase !== "string") return null;
  return evidence as FailureEvidence;
}

const PHASE_LABELS: Record<"en" | "tr", Record<FailureEvidencePhase, string>> = {
  en: {
    dns: "resolving the address",
    connect: "connecting",
    tls: "the TLS handshake",
    "first-byte": "waiting for the first byte",
    body: "reading the response body",
    response: "checking the response",
  },
  tr: {
    dns: "adres çözümlenirken",
    connect: "bağlantı kurulurken",
    tls: "TLS el sıkışmasında",
    "first-byte": "ilk bayt beklenirken",
    body: "yanıt gövdesi okunurken",
    response: "yanıt değerlendirilirken",
  },
};

// One line for email and Telegram; the body excerpt stays in the panel.
export function summarizeFailureEvidence(evidence: FailureEvidence, language: "en" | "tr") {
  const finalHop = evidence.hops[evidence.hops.length - 1];
  const parts: string[] = [];
  const tr = language === "tr";

  if (finalHop?.remoteAddress) {
    parts.push(formatAddress(finalHop.remoteAddress, finalHop.remotePort));
  }
  if (finalHop) {
    const timings = finalHop.timings;
    const timingParts = [
      timings.dnsMs !== null ? `DNS ${formatMs(timings.dnsMs)}` : null,
      timings.connectMs !== null ? `${tr ? "bağlantı" : "connect"} ${formatMs(timings.connectMs)}` : null,
      timings.tlsMs !== null ? `TLS ${formatMs(timings.tlsMs)}` : null,
      timings.firstByteMs !== null ? `${tr ? "ilk bayt" : "first byte"} ${formatMs(timings.firstByteMs)}` : null,
    ].filter((part): part is string => part !== null);
    parts.push(...timingParts);
  }
  if (evidence.phase !== "response") {
    parts.push(tr ? `${PHASE_LABELS.tr[evidence.phase]} durdu` : `stopped while ${PHASE_LABELS.en[evidence.phase]}`);
  }
  if (evidence.hops.length > 1) {
    const redirects = evidence.hops.length - 1;
    parts.push(tr ? `${redirects} yönlendirme` : `${redirects} redirect${redirects === 1 ? "" : "s"}`);
  }
  const headers = finalHop?.headers ?? {};
  for (const name of ["server", "cf-ray", "x-cache", "retry-after"] as const) {
    // Values come from the monitored server; the alert carries only a short form of them.
    if (headers[name]) parts.push(`${name}: ${truncate(headers[name], MAX_SUMMARY_HEADER_LENGTH)}`);
  }

  return parts.join(" · ");
}

export function describeFailurePhase(phase: FailureEvidencePhase, language: "en" | "tr" = "en") {
  return PHASE_LABELS[language][phase];
}

function formatAddress(address: string, port: number | null) {
  const host = address.includes(":") ? `[${address}]` : address;
  return port ? `${host}:${port}` : host;
}

function formatMs(value: number) {
  return value >= 10_000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
}
