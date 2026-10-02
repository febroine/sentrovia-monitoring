import http from "node:http";
import https from "node:https";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import tls, { type TLSSocket } from "node:tls";
import type { Monitor } from "@/lib/db/schema";
import {
  buildBodyExcerpt,
  pickRecordedHeaders,
  redactUrl,
  truncateEvidenceError,
  type FailureEvidence,
  type FailureEvidenceCertificate,
  type FailureEvidenceHop,
  type FailureEvidencePhase,
} from "@/lib/monitors/failure-evidence";
import { MONITOR_REQUEST_HEADERS } from "@/lib/monitors/request-identity";
import {
  hasExpectedStatusCodeOverride,
  isCustomExpectedStatusCode,
  isExpectedHttpStatusCode,
} from "@/lib/monitors/status-codes";
import {
  createPinnedLookup,
  resolveMonitorNetworkTargetWithTimeout,
} from "@/lib/security/public-network-target";
import { classifyFailureMessage, formatTimeoutDuration } from "@/worker/failure-reasons";
import type { CheckResult } from "@/worker/types";

interface HttpResponseSnapshot {
  statusCode: number;
  bodyText: string;
  sslExpiresAt: Date | null;
}

// Collects what the request saw while it runs, so a failure can be explained afterwards.
type EvidenceRecorder = {
  hops: FailureEvidenceHop[];
  stage: FailureEvidencePhase;
  certificate: FailureEvidenceCertificate | null;
  finalBody: { text: string; contentType: string | null } | null;
};

const MONITOR_PUBLIC_TARGET_ERROR = "Monitor target is not allowed by the current network safety policy.";
const ABSOLUTE_RESPONSE_BODY_LIMIT_BYTES = 100_000;

export async function checkHttpMonitor(
  monitor: Monitor,
  allowPrivateTargets = false
): Promise<CheckResult> {
  const checkedAt = new Date();
  const recorder: EvidenceRecorder = { hops: [], stage: "dns", certificate: null, finalBody: null };

  try {
    const response = await requestWithRedirects(
      monitor,
      buildRequestUrl(monitor.url, monitor.cacheBuster),
      0,
      undefined,
      undefined,
      allowPrivateTargets,
      recorder
    );
    const result = evaluateHttpResponse(monitor, response.statusCode, response.bodyText);

    return buildCheckResult(checkedAt, {
      ok: result.ok,
      status: result.ok ? "up" : "down",
      statusCode: response.statusCode,
      errorMessage: result.errorMessage,
      failureReason: result.failureReason,
      sslExpiresAt: response.sslExpiresAt,
      evidence: result.ok ? null : buildFailureEvidence(recorder, "response", result.errorMessage),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const checkDurationMs = Math.max(1, Date.now() - checkedAt.getTime());
    const errorMessage = formatRequestFailureMessage(message, monitor.timeout, checkDurationMs);
    const failureReason = classifyFailureMessage(message);
    const latencyMs = Math.max(1, Date.now() - checkedAt.getTime());
    if (failureReason === "tls") {
      await recordRejectedCertificate(recorder);
    }
    return {
      ...buildCheckResult(checkedAt, {
        ok: false,
        status: "down",
        statusCode: null,
        errorMessage,
        failureReason,
        sslExpiresAt: null,
        evidence: buildFailureEvidence(recorder, recorder.stage, errorMessage),
      }),
      // Reading the rejected certificate is not part of the check's response time.
      latencyMs,
    };
  }
}

function buildFailureEvidence(
  recorder: EvidenceRecorder,
  phase: FailureEvidencePhase,
  errorMessage: string | null
): FailureEvidence | null {
  if (recorder.hops.length === 0) {
    return null;
  }

  return {
    version: 1,
    phase,
    hops: recorder.hops,
    certificate: recorder.certificate,
    body: recorder.finalBody ? buildBodyExcerpt(recorder.finalBody.text, recorder.finalBody.contentType) : null,
    error: truncateEvidenceError(errorMessage),
  };
}

function evaluateHttpResponse(monitor: Monitor, statusCode: number, bodyText: string) {
  const hasCustomExpectedStatusCodes = hasExpectedStatusCodeOverride(monitor.expectedStatusCodes);

  if (!isExpectedHttpStatusCode(monitor.expectedStatusCodes, statusCode)) {
    return {
      ok: false,
      failureReason: "http_status" as const,
      errorMessage: `Service returned HTTP ${statusCode}.`,
    };
  }

  if (!hasCustomExpectedStatusCodes && isRedirectStatus(statusCode)) {
    return {
      ok: false,
      failureReason: "redirect" as const,
      errorMessage: `HTTP ${statusCode} redirect response was not followed within the configured redirect limit.`,
    };
  }

  if (!hasCustomExpectedStatusCodes && (statusCode < 200 || statusCode >= 400)) {
    return {
      ok: false,
      failureReason: "http_status" as const,
      errorMessage: `Service returned HTTP ${statusCode}.`,
    };
  }

  if (monitor.monitorType === "keyword") {
    return evaluateKeywordResponse(monitor, bodyText);
  }

  if (monitor.monitorType === "json") {
    return evaluateJsonResponse(monitor, bodyText);
  }

  return { ok: true, errorMessage: null };
}

function evaluateKeywordResponse(monitor: Monitor, bodyText: string) {
  const query = monitor.keywordQuery?.trim() ?? "";
  const containsKeyword = query.length > 0 && bodyText.includes(query);
  const ok = monitor.keywordInvert ? !containsKeyword : containsKeyword;

  if (ok) {
    return { ok: true, errorMessage: null };
  }

  const message = monitor.keywordInvert
    ? `Keyword assertion failed because "${query}" was still present in the response body.`
    : `Keyword assertion failed because "${query}" was not found in the response body.`;

  return { ok: false, failureReason: "assertion" as const, errorMessage: message };
}

function evaluateJsonResponse(monitor: Monitor, bodyText: string) {
  let payload: unknown;

  try {
    payload = JSON.parse(bodyText);
  } catch {
    return {
      ok: false,
      failureReason: "assertion" as const,
      errorMessage: "JSON assertion failed because the response body is not valid JSON.",
    };
  }

  const extracted = readJsonPath(payload, monitor.jsonPath ?? "");
  const expected = monitor.jsonExpectedValue ?? "";
  const matchMode = monitor.jsonMatchMode ?? "equals";
  const actual = extracted === undefined ? undefined : stringifyJsonValue(extracted);
  const ok = matchesJsonAssertion(matchMode, actual, expected);

  if (ok) {
    return { ok: true, errorMessage: null };
  }

  return {
    ok: false,
    failureReason: "assertion" as const,
    errorMessage:
      matchMode === "exists"
        ? `JSON assertion failed because path "${monitor.jsonPath}" was not present.`
        : `JSON assertion failed for path "${monitor.jsonPath}". Expected ${matchMode} "${expected}" but received "${actual ?? "undefined"}".`,
  };
}

async function requestWithRedirects(
  monitor: Monitor,
  url: string,
  redirectCount: number,
  deadlineAt = Date.now() + monitor.timeout,
  method: Monitor["method"] = monitor.method,
  allowPrivateTargets = false,
  recorder?: EvidenceRecorder
): Promise<HttpResponseSnapshot> {
  const parsed = new URL(url);
  const hopStartedAt = Date.now();
  const hop = startEvidenceHop(recorder, parsed, method);
  const resolutionTimeoutMs = deadlineAt - Date.now();
  if (resolutionTimeoutMs <= 0) {
    throw buildRequestTimeoutError(monitor.timeout);
  }
  const resolvedTarget = await resolveMonitorNetworkTargetWithTimeout(parsed.hostname, {
    allowPrivateTargets,
    message: MONITOR_PUBLIC_TARGET_ERROR,
  }, resolutionTimeoutMs);
  const requestStartedAt = Date.now();
  if (hop && recorder) {
    hop.timings.dnsMs = requestStartedAt - hopStartedAt;
    recorder.stage = "connect";
  }
  const remainingTimeoutMs = deadlineAt - Date.now();
  if (remainingTimeoutMs <= 0) {
    throw buildRequestTimeoutError(monitor.timeout);
  }

  return new Promise((resolve, reject) => {
    const transport = parsed.protocol === "https:" ? https : http;
    let activeResponse: IncomingMessage | null = null;
    let settled = false;
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;

    const resolveOnce = (value: HttpResponseSnapshot | PromiseLike<HttpResponseSnapshot>) => {
      if (settled) return;
      settled = true;
      if (deadlineTimer) clearTimeout(deadlineTimer);
      resolve(value);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      if (deadlineTimer) clearTimeout(deadlineTimer);
      reject(error);
    };
    const request = transport.request(
      parsed,
      {
        method,
        headers: MONITOR_REQUEST_HEADERS,
        // Every check opens its own connection. Node keeps connections alive by default, so a check
        // could reuse a socket from the previous one and report a site up that no longer accepts
        // connections, or keep talking to an old address after a DNS change.
        agent: false,
        family: toNodeFamily(monitor.ipFamily),
        lookup: createPinnedLookup(resolvedTarget),
        rejectUnauthorized: parsed.protocol === "https:" ? !monitor.ignoreSslErrors : undefined,
      },
      (response) => {
        activeResponse = response;
        const statusCode = response.statusCode ?? 0;
        recordEvidenceResponse(recorder, hop, response, requestStartedAt);
        const location = response.headers.location;
        const sslExpiresAt = readResponseSslExpiry(response, monitor.checkSslExpiry);

        if (
          isRedirectStatus(statusCode)
          && location
          && redirectCount < monitor.maxRedirects
          && !isCustomExpectedStatusCode(monitor.expectedStatusCodes, statusCode)
        ) {
          response.resume();
          let nextUrl: string;
          try {
            nextUrl = new URL(location, parsed).toString();
          } catch {
            rejectOnce(new Error("Service returned an invalid redirect location."));
            return;
          }
          if (hop) hop.timings.totalMs = Date.now() - hopStartedAt;
          resolveOnce(requestWithRedirects(
            monitor,
            nextUrl,
            redirectCount + 1,
            deadlineAt,
            resolveRedirectMethod(statusCode, method),
            allowPrivateTargets,
            recorder
          ));
          return;
        }

        consumeResponse(response, monitor.responseMaxLength).then(
          (bodyText) => {
            if (recorder && hop) {
              hop.timings.totalMs = Date.now() - hopStartedAt;
              recorder.stage = "response";
              recorder.finalBody = { text: bodyText, contentType: readHeader(response.headers["content-type"]) };
            }
            resolveOnce({
              statusCode,
              bodyText,
              sslExpiresAt,
            });
          },
          rejectOnce
        );
      }
    );

    watchEvidenceSocket(request, recorder, hop, parsed, requestStartedAt);
    deadlineTimer = setTimeout(() => {
      const timeoutError = buildRequestTimeoutError(monitor.timeout);
      activeResponse?.destroy(timeoutError);
      request.destroy(timeoutError);
      rejectOnce(timeoutError);
    }, remainingTimeoutMs);
    request.on("error", rejectOnce);
    request.end();
  });
}

const CERTIFICATE_READ_TIMEOUT_MS = 2_000;

// A certificate the check rejected cannot be read from the failed connection, so it is read once more
// from the same address with verification off. Only the handshake runs; no request is sent.
async function recordRejectedCertificate(recorder: EvidenceRecorder) {
  const hop = recorder.hops[recorder.hops.length - 1];
  if (recorder.certificate || !hop?.remoteAddress || !hop.remotePort || !hop.url.startsWith("https:")) return;

  let servername: string | undefined;
  try {
    const hostname = new URL(hop.url).hostname;
    // SNI takes host names only.
    servername = /^[\d.]+$|:/.test(hostname) ? undefined : hostname;
  } catch {
    servername = undefined;
  }

  recorder.certificate = await new Promise<FailureEvidenceCertificate | null>((resolve) => {
    const socket = tls.connect({
      host: hop.remoteAddress!,
      port: hop.remotePort!,
      servername,
      rejectUnauthorized: false,
      timeout: CERTIFICATE_READ_TIMEOUT_MS,
    });
    const finish = (certificate: FailureEvidenceCertificate | null) => {
      socket.destroy();
      resolve(certificate);
    };
    socket.once("secureConnect", () => finish(readEvidenceCertificate(socket)));
    socket.once("timeout", () => finish(null));
    socket.once("error", () => finish(null));
  });
}

function startEvidenceHop(recorder: EvidenceRecorder | undefined, url: URL, method: string) {
  if (!recorder) return null;

  const hop: FailureEvidenceHop = {
    url: redactUrl(url.toString()),
    method,
    statusCode: null,
    remoteAddress: null,
    remotePort: null,
    reusedConnection: false,
    timings: { dnsMs: null, connectMs: null, tlsMs: null, firstByteMs: null, totalMs: null },
    headers: {},
  };
  recorder.hops.push(hop);
  recorder.stage = "dns";
  // The certificate belongs to the hop that failed, never to an earlier one.
  recorder.certificate = null;
  return hop;
}

function watchEvidenceSocket(
  request: ClientRequest,
  recorder: EvidenceRecorder | undefined,
  hop: FailureEvidenceHop | null,
  url: URL,
  requestStartedAt: number
) {
  if (!recorder || !hop) return;

  hop.remotePort = Number(url.port) || (url.protocol === "https:" ? 443 : 80);
  // A rejected certificate (expired, wrong host) is the very thing to show, and it is only readable
  // while the failed handshake's socket is still around.
  request.once("error", () => {
    if (!recorder.certificate && url.protocol === "https:" && request.socket) {
      recorder.certificate = readEvidenceCertificate(request.socket as TLSSocket);
    }
  });
  request.once("socket", (socket: Socket) => {
    if (request.reusedSocket) {
      hop.reusedConnection = true;
      hop.remoteAddress = socket.remoteAddress ?? null;
      recorder.stage = "first-byte";
      return;
    }

    // The address being dialled is known before the connection succeeds, so a connect timeout still
    // names the server that did not answer.
    socket.once("lookup", (_error: Error | null, address: string) => {
      hop.remoteAddress ??= address || null;
    });
    socket.once("connect", () => {
      const connectedAt = Date.now();
      hop.timings.connectMs = connectedAt - requestStartedAt;
      hop.remoteAddress = socket.remoteAddress ?? hop.remoteAddress;
      hop.remotePort = socket.remotePort ?? hop.remotePort;
      recorder.stage = url.protocol === "https:" ? "tls" : "first-byte";
      socket.once("secureConnect", () => {
        hop.timings.tlsMs = Date.now() - connectedAt;
        recorder.certificate = readEvidenceCertificate(socket as TLSSocket);
        recorder.stage = "first-byte";
      });
    });
  });
}

function recordEvidenceResponse(
  recorder: EvidenceRecorder | undefined,
  hop: FailureEvidenceHop | null,
  response: IncomingMessage,
  requestStartedAt: number
) {
  if (!recorder || !hop) return;

  // Time the server took to answer once the connection was ready.
  const readyAfterMs = (hop.timings.connectMs ?? 0) + (hop.timings.tlsMs ?? 0);
  hop.timings.firstByteMs = Math.max(0, Date.now() - requestStartedAt - readyAfterMs);
  hop.statusCode = response.statusCode ?? null;
  hop.headers = pickRecordedHeaders(response.headers);
  hop.remoteAddress ??= response.socket?.remoteAddress ?? null;
  recorder.stage = "body";
}

function readEvidenceCertificate(socket: TLSSocket): FailureEvidenceCertificate | null {
  try {
    const certificate = socket.getPeerCertificate?.();
    if (!certificate || Object.keys(certificate).length === 0) return null;
    return {
      subject: readCertificateName(certificate.subject),
      issuer: readCertificateName(certificate.issuer),
      validFrom: certificate.valid_from ?? null,
      validTo: certificate.valid_to ?? null,
      protocol: socket.getProtocol?.() ?? null,
    };
  } catch {
    return null;
  }
}

function readCertificateName(name: Record<string, string | string[] | undefined> | undefined) {
  if (!name) return null;
  const value = name.CN ?? name.O;
  return (Array.isArray(value) ? value.join(", ") : value) ?? null;
}

function readHeader(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function isRedirectStatus(statusCode: number) {
  return statusCode === 301
    || statusCode === 302
    || statusCode === 303
    || statusCode === 307
    || statusCode === 308;
}

function resolveRedirectMethod(statusCode: number, method: Monitor["method"]): Monitor["method"] {
  if (statusCode === 303 && method !== "HEAD") {
    return "GET";
  }

  if ((statusCode === 301 || statusCode === 302) && method === "POST") {
    return "GET";
  }

  return method;
}

function buildRequestTimeoutError(timeoutMs: number) {
  return new Error(`Request timed out after ${timeoutMs}ms`);
}

async function consumeResponse(response: IncomingMessage, responseMaxLength: number) {
  const configuredLimit = Number.isFinite(responseMaxLength) ? Math.max(0, responseMaxLength) : 0;
  const limit = configuredLimit > 0
    ? Math.min(configuredLimit, ABSOLUTE_RESPONSE_BODY_LIMIT_BYTES)
    : ABSOLUTE_RESPONSE_BODY_LIMIT_BYTES;
  const chunks: Buffer[] = [];
  let received = 0;

  for await (const chunk of response) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;

    if (received > limit) {
      chunks.push(buffer.subarray(0, Math.max(0, limit - (received - buffer.length))));
      break;
    }

    chunks.push(buffer);
  }

  let decodedBody: Buffer;
  try {
    decodedBody = decodeResponseBody(Buffer.concat(chunks), response.headers["content-encoding"]);
  } catch {
    throw new Error("Response body assertion could not be evaluated because the encoded body is invalid or truncated.");
  }
  return decodedBody.subarray(0, limit).toString("utf8");
}

function decodeResponseBody(body: Buffer, contentEncoding: string | string[] | undefined) {
  if (body.length === 0) {
    return body;
  }

  const encodings = (Array.isArray(contentEncoding) ? contentEncoding.join(",") : contentEncoding ?? "")
    .split(",")
    .map((encoding) => encoding.trim().toLowerCase())
    .filter(Boolean)
    .reverse();

  return encodings.reduce((decoded, encoding) => {
    if (encoding === "gzip" || encoding === "x-gzip") {
      return gunzipSync(decoded, { maxOutputLength: ABSOLUTE_RESPONSE_BODY_LIMIT_BYTES });
    }

    if (encoding === "br") {
      return brotliDecompressSync(decoded, { maxOutputLength: ABSOLUTE_RESPONSE_BODY_LIMIT_BYTES });
    }

    if (encoding === "deflate") {
      return inflateSync(decoded, { maxOutputLength: ABSOLUTE_RESPONSE_BODY_LIMIT_BYTES });
    }

    return decoded;
  }, body);
}

function buildRequestUrl(url: string, cacheBuster: boolean) {
  const parsed = new URL(stripAssertionHash(url));

  if (cacheBuster) {
    parsed.searchParams.set("_monitor_ts", String(Date.now()));
  }

  return parsed.toString();
}

function stripAssertionHash(url: string) {
  return url.split("#")[0];
}

function readResponseSslExpiry(response: IncomingMessage, enabled: boolean) {
  if (!enabled || typeof (response.socket as TLSSocket).getPeerCertificate !== "function") {
    return null;
  }

  const certificate = (response.socket as TLSSocket).getPeerCertificate();
  return parseCertificateExpiry(certificate?.valid_to);
}

function parseCertificateExpiry(value: string | undefined) {
  if (!value) {
    return null;
  }

  const expiresAt = new Date(value);
  return Number.isNaN(expiresAt.getTime()) ? null : expiresAt;
}

function readJsonPath(payload: unknown, path: string) {
  const segments = path
    .trim()
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);

  return segments.reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }

    if (typeof current === "object") {
      return (current as Record<string, unknown>)[segment];
    }

    return undefined;
  }, payload);
}

function matchesJsonAssertion(mode: Monitor["jsonMatchMode"], actual: string | undefined, expected: string) {
  if (mode === "exists") {
    return actual !== undefined;
  }

  if (actual === undefined) {
    return false;
  }

  if (mode === "contains") {
    return actual.includes(expected);
  }

  return actual === expected;
}

function stringifyJsonValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function toNodeFamily(ipFamily: Monitor["ipFamily"]) {
  if (ipFamily === "ipv4") {
    return 4;
  }

  if (ipFamily === "ipv6") {
    return 6;
  }

  return undefined;
}

function buildCheckResult(
  checkedAt: Date,
  result: Omit<CheckResult, "checkedAt" | "latencyMs">
): CheckResult {
  return {
    ...result,
    checkedAt,
    latencyMs: Math.max(1, Date.now() - checkedAt.getTime()),
  };
}

function formatRequestFailureMessage(message: string, timeoutMs: number, checkDurationMs: number) {
  if (/^Request timed out after \d+ms$/i.test(message)) {
    return `Service did not complete within the ${formatTimeoutDuration(timeoutMs)} hard timeout.`;
  }

  if (classifyFailureMessage(message) === "timeout") {
    return `A network operation timed out after ${formatTimeoutDuration(checkDurationMs)}; the configured hard timeout is ${formatTimeoutDuration(timeoutMs)}.`;
  }

  return message;
}
