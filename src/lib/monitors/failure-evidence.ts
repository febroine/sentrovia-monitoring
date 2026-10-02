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
    const redacted = isAbsolute ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
    return truncate(redacted, MAX_URL_LENGTH);
  } catch {
    return truncate(value.split("?")[0], MAX_URL_LENGTH);
  }
}

// A readable, secret-free excerpt of the response body. Markup, scripts and styles are removed so the
// excerpt shows what a visitor would read (e.g. "502 Bad Gateway"); binary bodies are left out.
export function buildBodyExcerpt(bodyText: string, contentType: string | null) {
  if (!bodyText || !isTextContentType(contentType) || looksBinary(bodyText)) return null;

  const isHtml = /html|xml/i.test(contentType ?? "") || /^\s*</.test(bodyText);
  const readable = isHtml ? htmlToText(bodyText) : bodyText;
  const normalized = redactSecrets(readable)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  if (!normalized) return null;

  return {
    contentType,
    excerpt: normalized.slice(0, FAILURE_EVIDENCE_BODY_LIMIT),
    truncated: normalized.length > FAILURE_EVIDENCE_BODY_LIMIT,
  };
}

export function redactSecrets(text: string) {
  return text
    // JSON style: "token": "value"
    .replace(/("[^"\n]{0,60}"\s*:\s*)"([^"\n]*)"/g, (match, prefix: string) =>
      SENSITIVE_BODY_KEY.test(prefix) ? `${prefix}"${REDACTED}"` : match)
    // key=value or key: value
    .replace(/\b([\w.-]{0,40}(?:pass(?:word|wd)?|secret|token|api[-_]?key|access[-_]?key|session|signature|credential)[\w.-]{0,20})(\s*[=:]\s*)([^\s&,;"'<>]+)/gi,
      (_match, key: string, separator: string) => `${key}${separator}${REDACTED}`)
    // Bearer tokens and JWTs
    .replace(/\bBearer\s+[\w.~+/-]+=*/gi, `Bearer ${REDACTED}`)
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, REDACTED)
    // Long opaque strings (keys, hashes, session ids); a long path or word without digits is kept.
    .replace(/\b(?=[A-Za-z0-9+_-]*\d)[A-Za-z0-9+_-]{40,}={0,2}/g, REDACTED);
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
  return /^text\/|json|xml|html|javascript|x-www-form-urlencoded|problem/i.test(contentType);
}

function htmlToText(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/title)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => safeCharacter(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => safeCharacter(Number.parseInt(code, 16)));
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
    if (headers[name]) parts.push(`${name}: ${headers[name]}`);
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
