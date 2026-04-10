import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import type { IncomingMessage } from "node:http";
import type { Monitor } from "@/lib/db/schema";
import type { CheckResult } from "@/worker/types";

interface HttpResponseSnapshot {
  statusCode: number;
  bodyText: string;
}

export async function checkHttpMonitor(monitor: Monitor): Promise<CheckResult> {
  const checkedAt = new Date();

  try {
    const response = await requestWithRedirects(monitor, buildRequestUrl(monitor.url, monitor.cacheBuster), 0);
    const sslExpiresAt = monitor.checkSslExpiry ? await readSslExpiry(monitor.url, monitor.ignoreSslErrors) : null;
    const result = evaluateHttpResponse(monitor, response.statusCode, response.bodyText);

    return buildCheckResult(checkedAt, {
      ok: result.ok,
      status: result.ok ? "up" : "down",
      statusCode: response.statusCode,
      errorMessage: result.errorMessage,
      sslExpiresAt,
    });
  } catch (error) {
    return buildCheckResult(checkedAt, {
      ok: false,
      status: "down",
      statusCode: null,
      errorMessage: error instanceof Error ? error.message : "Request failed",
      sslExpiresAt: null,
    });
  }
}

function evaluateHttpResponse(monitor: Monitor, statusCode: number, bodyText: string) {
  if (statusCode < 200 || statusCode >= 400) {
    return {
      ok: false,
      errorMessage: `HTTP ${statusCode}`,
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

  return { ok: false, errorMessage: message };
}

function evaluateJsonResponse(monitor: Monitor, bodyText: string) {
  let payload: unknown;

  try {
    payload = JSON.parse(bodyText);
  } catch {
    return {
      ok: false,
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
    errorMessage:
      matchMode === "exists"
        ? `JSON assertion failed because path "${monitor.jsonPath}" was not present.`
        : `JSON assertion failed for path "${monitor.jsonPath}". Expected ${matchMode} "${expected}" but received "${actual ?? "undefined"}".`,
  };
}

function requestWithRedirects(monitor: Monitor, url: string, redirectCount: number): Promise<HttpResponseSnapshot> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;
    const request = transport.request(
      parsed,
      {
        method: monitor.method,
        family: toNodeFamily(monitor.ipFamily),
        timeout: monitor.timeout,
        rejectUnauthorized: parsed.protocol === "https:" ? !monitor.ignoreSslErrors : undefined,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;

        if (statusCode >= 300 && statusCode < 400 && location && redirectCount < monitor.maxRedirects) {
          response.resume();
          const nextUrl = new URL(location, parsed).toString();
          resolve(requestWithRedirects(monitor, nextUrl, redirectCount + 1));
          return;
        }

        consumeResponse(response, monitor.responseMaxLength).then(
          (bodyText) => resolve({ statusCode, bodyText }),
          reject
        );
      }
    );

    request.on("timeout", () => request.destroy(new Error(`Request timed out after ${monitor.timeout}ms`)));
    request.on("error", reject);
    request.end();
  });
}

async function consumeResponse(response: IncomingMessage, responseMaxLength: number) {
  const limit = Math.max(0, responseMaxLength || 0);
  const chunks: Buffer[] = [];
  let received = 0;

  for await (const chunk of response) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;

    if (limit > 0 && received > limit) {
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

function readSslExpiry(url: string, ignoreSslErrors: boolean): Promise<Date | null> {
  const parsed = new URL(stripAssertionHash(url));
  if (parsed.protocol !== "https:") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: parsed.hostname,
        port: Number(parsed.port || 443),
        servername: parsed.hostname,
        rejectUnauthorized: !ignoreSslErrors,
      },
      () => {
        const certificate = socket.getPeerCertificate();
        socket.end();
        resolve(parseCertificateExpiry(certificate?.valid_to));
      }
    );

    socket.setTimeout(5_000, () => {
      socket.destroy();
      resolve(null);
    });
    socket.on("error", () => resolve(null));
  });
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
