import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import type { Monitor } from "@/lib/db/schema";
import type { CheckResult } from "@/worker/types";

export async function checkHttpMonitor(monitor: Monitor): Promise<CheckResult> {
  const checkedAt = new Date();

  try {
    const statusCode = await requestWithRedirects(monitor, buildUrl(monitor.url, monitor.cacheBuster), 0);
    const sslExpiresAt = monitor.checkSslExpiry ? await readSslExpiry(monitor.url, monitor.ignoreSslErrors) : null;

    return buildCheckResult(checkedAt, {
      ok: statusCode >= 200 && statusCode < 400,
      status: statusCode >= 200 && statusCode < 400 ? "up" : "down",
      statusCode,
      errorMessage: statusCode >= 200 && statusCode < 400 ? null : `HTTP ${statusCode}`,
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

function requestWithRedirects(monitor: Monitor, url: string, redirectCount: number): Promise<number> {
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

        consumeResponse(response, monitor.responseMaxLength, () => resolve(statusCode), reject);
      }
    );

    request.on("timeout", () => request.destroy(new Error(`Request timed out after ${monitor.timeout}ms`)));
    request.on("error", reject);
    request.end();
  });
}

function consumeResponse(
  response: http.IncomingMessage,
  responseMaxLength: number,
  onDone: () => void,
  onError: (error: Error) => void
) {
  const limit = Math.max(0, responseMaxLength);
  let received = 0;
  let finished = false;

  response.on("data", (chunk: Buffer) => {
    received += chunk.length;
    if (!finished && limit > 0 && received > limit) {
      finished = true;
      onDone();
      response.destroy();
    }
  });
  response.on("end", () => {
    if (!finished) {
      finished = true;
      onDone();
    }
  });
  response.on("error", onError);
  response.resume();
}

function buildUrl(url: string, cacheBuster: boolean) {
  if (!cacheBuster) {
    return url;
  }

  const parsed = new URL(url);
  parsed.searchParams.set("_monitor_ts", String(Date.now()));
  return parsed.toString();
}

function readSslExpiry(url: string, ignoreSslErrors: boolean): Promise<Date | null> {
  const parsed = new URL(url);
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
