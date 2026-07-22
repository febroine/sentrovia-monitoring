import http from "node:http";
import https from "node:https";
import type { IncomingMessage } from "node:http";
import type { TLSSocket } from "node:tls";
import type { Monitor } from "@/lib/db/schema";
import { env } from "@/lib/env";
import {
  hasExpectedStatusCodeOverride,
  isCustomExpectedStatusCode,
  isExpectedHttpStatusCode,
} from "@/lib/monitors/status-codes";
import { assertMonitorNetworkTarget } from "@/lib/security/public-network-target";
import { classifyFailureMessage, formatTimeoutDuration } from "@/worker/failure-reasons";
import type { CheckResult } from "@/worker/types";

interface HttpResponseSnapshot {
  statusCode: number;
  bodyText: string;
  sslExpiresAt: Date | null;
}

const MONITOR_PUBLIC_TARGET_ERROR = "Monitor target is not allowed by the current network safety policy.";
const ABSOLUTE_RESPONSE_BODY_LIMIT_BYTES = 100_000;

export async function checkHttpMonitor(monitor: Monitor): Promise<CheckResult> {
  const checkedAt = new Date();

  try {
    const response = await requestWithRedirects(monitor, buildRequestUrl(monitor.url, monitor.cacheBuster), 0);
    const result = evaluateHttpResponse(monitor, response.statusCode, response.bodyText);

    return buildCheckResult(checkedAt, {
      ok: result.ok,
      status: result.ok ? "up" : "down",
      statusCode: response.statusCode,
      errorMessage: result.errorMessage,
      failureReason: result.failureReason,
      sslExpiresAt: response.sslExpiresAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return buildCheckResult(checkedAt, {
      ok: false,
      status: "down",
      statusCode: null,
      errorMessage: formatRequestFailureMessage(message, monitor.timeout),
      failureReason: classifyFailureMessage(message),
      sslExpiresAt: null,
    });
  }
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
  method: Monitor["method"] = monitor.method
): Promise<HttpResponseSnapshot> {
  const parsed = new URL(url);
  await assertMonitorNetworkTarget(parsed.hostname, {
    allowPrivateTargets: env.monitorAllowPrivateTargets,
    message: MONITOR_PUBLIC_TARGET_ERROR,
  });
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
        family: toNodeFamily(monitor.ipFamily),
        rejectUnauthorized: parsed.protocol === "https:" ? !monitor.ignoreSslErrors : undefined,
      },
      (response) => {
        activeResponse = response;
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;
        const sslExpiresAt = readResponseSslExpiry(response, monitor.checkSslExpiry);

        if (
          isRedirectStatus(statusCode)
          && location
          && redirectCount < monitor.maxRedirects
          && !isCustomExpectedStatusCode(monitor.expectedStatusCodes, statusCode)
        ) {
          response.resume();
          const nextUrl = new URL(location, parsed).toString();
          resolveOnce(requestWithRedirects(
            monitor,
            nextUrl,
            redirectCount + 1,
            deadlineAt,
            resolveRedirectMethod(statusCode, method)
          ));
          return;
        }

        consumeResponse(response, monitor.responseMaxLength).then(
          (bodyText) => resolveOnce({
            statusCode,
            bodyText,
            sslExpiresAt,
          }),
          rejectOnce
        );
      }
    );

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

  return Buffer.concat(chunks).toString("utf8");
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

function formatRequestFailureMessage(message: string, timeoutMs: number) {
  if (classifyFailureMessage(message) === "timeout") {
    return `Service did not respond within ${formatTimeoutDuration(timeoutMs)}.`;
  }

  return message;
}
