import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import type { Monitor } from "@/lib/db/schema";
import { canUserAccessPrivateTargets } from "@/lib/security/network-policy";
import {
  parsePingMonitorTarget,
  parsePortMonitorTarget,
  parsePostgresMonitorTarget,
} from "@/lib/monitors/targets";
import {
  hasExpectedStatusCodeOverride,
  isCustomExpectedStatusCode,
  isExpectedHttpStatusCode,
} from "@/lib/monitors/status-codes";
import {
  createPinnedLookup,
  resolveMonitorNetworkTargetWithTimeout,
  type ResolvedNetworkTarget,
} from "@/lib/security/public-network-target";
import type {
  DiagnosticFailureCategory,
  DiagnosticPhase,
  DiagnosticStatus,
  DiagnosticStepResult,
  MonitorDiagnosticResult,
} from "@/lib/diagnostics/types";

const DEFAULT_HTTP_PORT = 80;
const DEFAULT_HTTPS_PORT = 443;
const DIAGNOSTIC_TIMEOUT_RATIO = 0.6;
const MIN_DIAGNOSTIC_TIMEOUT_MS = 2_000;
const MAX_DIAGNOSTIC_TIMEOUT_MS = 10_000;
const MONITOR_PUBLIC_TARGET_ERROR = "Monitor target is not allowed by the current network safety policy.";

interface DiagnosticTarget {
  host: string;
  port: number | null;
  protocol: "http:" | "https:" | "tcp:" | "dns:";
  url: string | null;
}

export async function runMonitorDiagnostics(monitor: Monitor): Promise<MonitorDiagnosticResult> {
  const createdAt = new Date();
  const timeoutMs = resolveDiagnosticTimeout(monitor.timeout);
  const deadlineAt = createdAt.getTime() + timeoutMs;
  const target = resolveDiagnosticTarget(monitor);

  if (!target || !target.host) {
    return buildDiagnosticResult({
      createdAt,
      timeoutMs,
      summary: "Diagnostics were skipped because this monitor type has no direct network target.",
      dnsStatus: "skipped",
      tcpStatus: "skipped",
      tlsStatus: "skipped",
      httpStatus: "skipped",
    });
  }

  const allowPrivateTargets = await resolvePrivateTargetAccess(monitor);
  const resolvedTarget = await resolveMonitorNetworkTargetWithTimeout(target.host, {
    allowPrivateTargets,
    message: MONITOR_PUBLIC_TARGET_ERROR,
  }, getRemainingTimeout(deadlineAt));
  const dnsResult = buildDnsResult(resolvedTarget);
  if (dnsResult.status === "failed") {
    return buildDiagnosticResult({
      createdAt,
      timeoutMs,
      failedPhase: "dns",
      failureCategory: "dns_error",
      summary: "DNS resolution failed before a network connection could be opened.",
      dnsStatus: dnsResult.status,
      resolvedIps: dnsResult.addresses,
      errorMessage: dnsResult.errorMessage,
    });
  }

  const targetWithPort = target.port ? { ...target, port: target.port } : null;
  const tcpResult = targetWithPort
    ? await checkTcp(targetWithPort, resolvedTarget, getRemainingTimeout(deadlineAt))
    : skippedStep();
  if (tcpResult.status === "failed") {
    return buildDiagnosticResult({
      createdAt,
      timeoutMs,
      failedPhase: "tcp",
      failureCategory: categorizeError(tcpResult.errorMessage, "tcp"),
      summary: "The target host resolved, but the TCP connection did not complete.",
      dnsStatus: dnsResult.status,
      resolvedIps: dnsResult.addresses,
      tcpStatus: tcpResult.status,
      errorMessage: tcpResult.errorMessage,
    });
  }

  const tlsResult = target.protocol === "https:" && targetWithPort
    ? await checkTls(targetWithPort, resolvedTarget, monitor, getRemainingTimeout(deadlineAt))
    : skippedStep();
  if (tlsResult.status === "failed") {
    return buildDiagnosticResult({
      createdAt,
      timeoutMs,
      failedPhase: "tls",
      failureCategory: "tls_error",
      summary: "TCP connectivity worked, but TLS negotiation or certificate validation failed.",
      dnsStatus: dnsResult.status,
      resolvedIps: dnsResult.addresses,
      tcpStatus: tcpResult.status,
      tlsStatus: tlsResult.status,
      errorMessage: tlsResult.errorMessage,
    });
  }

  let httpResult: Awaited<ReturnType<typeof checkHttp>> | null = null;
  try {
    httpResult = target.url
      ? await checkHttp(
        target.url,
        monitor,
        allowPrivateTargets,
        timeoutMs,
        0,
        Date.now(),
        deadlineAt
      )
      : null;
  } catch (error) {
    const errorMessage = formatError(error);
    return buildDiagnosticResult({
      createdAt,
      timeoutMs,
      failedPhase: "http",
      failureCategory: categorizeError(errorMessage, "http"),
      summary: "The HTTP probe was stopped before a safe, complete response could be received.",
      dnsStatus: dnsResult.status,
      resolvedIps: dnsResult.addresses,
      tcpStatus: tcpResult.status,
      tlsStatus: tlsResult.status,
      httpStatus: "failed",
      errorMessage,
    });
  }
  const httpStatus = httpResult?.status ?? null;
  const failureCategory = httpResult?.status === "failed" ? categorizeHttpFailure(httpResult) : null;

  return buildDiagnosticResult({
    createdAt,
    timeoutMs,
    failedPhase: httpResult?.status === "failed" ? "http" : null,
    failureCategory,
    summary: buildSummary(httpResult),
    dnsStatus: dnsResult.status,
    resolvedIps: dnsResult.addresses,
    tcpStatus: tcpResult.status,
    tlsStatus: tlsResult.status,
    httpStatus,
    httpStatusCode: httpResult?.statusCode ?? null,
    responseTimeMs: httpResult?.responseTimeMs ?? null,
    errorMessage: httpResult?.errorMessage ?? null,
  });
}

function resolveDiagnosticTarget(monitor: Monitor): DiagnosticTarget | null {
  if (monitor.monitorType === "heartbeat") {
    return null;
  }

  if (monitor.monitorType === "port") {
    const target = parsePortMonitorTarget(monitor.url);
    return { host: target.host, port: target.port, protocol: "tcp:", url: null };
  }

  if (monitor.monitorType === "ping") {
    const target = parsePingMonitorTarget(monitor.url);
    return { host: target.host, port: null, protocol: "dns:", url: null };
  }

  if (monitor.monitorType === "postgres") {
    const target = parsePostgresMonitorTarget(monitor.url);
    return { host: target.host, port: target.port, protocol: "tcp:", url: null };
  }

  try {
    const parsed = new URL(monitor.url.split("#")[0]);
    const isHttps = parsed.protocol === "https:";
    const isHttp = parsed.protocol === "http:";
    if (!isHttp && !isHttps) {
      return null;
    }

    if (monitor.cacheBuster) {
      parsed.searchParams.set("_monitor_ts", String(Date.now()));
    }

    return {
      host: parsed.hostname,
      port: Number(parsed.port || (isHttps ? DEFAULT_HTTPS_PORT : DEFAULT_HTTP_PORT)),
      protocol: parsed.protocol as "http:" | "https:",
      url: parsed.toString(),
    };
  } catch {
    return null;
  }
}

function buildDnsResult(target: ResolvedNetworkTarget): DiagnosticStepResult & { addresses: string[] } {
  return {
    status: "ok",
    addresses: target.addresses.map((record) => record.address),
    errorMessage: null,
  };
}

function getRemainingTimeout(deadlineAt: number) {
  const remainingTimeoutMs = deadlineAt - Date.now();
  if (remainingTimeoutMs <= 0) {
    throw new Error("Network diagnostics timed out before completion.");
  }

  return remainingTimeoutMs;
}

function resolvePrivateTargetAccess(monitor: Monitor) {
  const claimedPolicy = (monitor as Monitor & { allowPrivateTargets?: boolean }).allowPrivateTargets;
  return claimedPolicy === undefined
    ? canUserAccessPrivateTargets(monitor.userId, undefined, monitor.workspaceId)
    : Promise.resolve(claimedPolicy);
}

function checkTcp(
  target: DiagnosticTarget & { port: number },
  resolvedTarget: ResolvedNetworkTarget,
  timeoutMs: number
): Promise<DiagnosticStepResult> {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: target.host,
      port: target.port,
      lookup: createPinnedLookup(resolvedTarget),
    });
    let settled = false;

    const finish = (status: DiagnosticStatus, errorMessage: string | null) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve({ status, errorMessage });
    };

    socket.setTimeout(timeoutMs, () => finish("failed", `TCP diagnostics timed out after ${timeoutMs}ms.`));
    socket.once("connect", () => finish("ok", null));
    socket.once("error", (error) => finish("failed", error.message));
  });
}

function checkTls(
  target: DiagnosticTarget & { port: number },
  resolvedTarget: ResolvedNetworkTarget,
  monitor: Monitor,
  timeoutMs: number
): Promise<DiagnosticStepResult> {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: target.host,
      port: target.port,
      servername: target.host,
      lookup: createPinnedLookup(resolvedTarget),
      rejectUnauthorized: !monitor.ignoreSslErrors,
    });
    let settled = false;

    const finish = (status: DiagnosticStatus, errorMessage: string | null) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve({ status, errorMessage });
    };

    socket.setTimeout(timeoutMs, () => finish("failed", `TLS diagnostics timed out after ${timeoutMs}ms.`));
    socket.once("secureConnect", () => finish("ok", null));
    socket.once("error", (error) => finish("failed", error.message));
  });
}

async function checkHttp(
  url: string,
  monitor: Monitor,
  allowPrivateTargets: boolean,
  timeoutMs: number,
  redirectCount = 0,
  startedAt = Date.now(),
  deadlineAt = startedAt + timeoutMs
) {
  const parsed = new URL(url);
  const remainingTimeoutMs = getRemainingTimeout(deadlineAt);
  const resolvedTarget = await resolveMonitorNetworkTargetWithTimeout(parsed.hostname, {
    allowPrivateTargets,
    message: MONITOR_PUBLIC_TARGET_ERROR,
  }, remainingTimeoutMs);

  return new Promise<DiagnosticStepResult & { statusCode: number | null; responseTimeMs: number | null }>((resolve) => {
    const transport = parsed.protocol === "https:" ? https : http;
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    const resolveAndClear = (
      result: (DiagnosticStepResult & { statusCode: number | null; responseTimeMs: number | null })
        | PromiseLike<DiagnosticStepResult & { statusCode: number | null; responseTimeMs: number | null }>
    ) => {
      if (deadlineTimer) {
        clearTimeout(deadlineTimer);
      }
      resolve(result);
    };
    const request = transport.request(
      parsed,
      {
        method: monitor.method,
        timeout: remainingTimeoutMs,
        lookup: createPinnedLookup(resolvedTarget),
        rejectUnauthorized: parsed.protocol === "https:" ? !monitor.ignoreSslErrors : undefined,
      },
      (response) => {
        const statusCode = response.statusCode ?? null;
        const location = response.headers.location;

        if (
          statusCode
          && statusCode >= 300
          && statusCode < 400
          && location
          && redirectCount < monitor.maxRedirects
          && !isCustomExpectedStatusCode(monitor.expectedStatusCodes, statusCode)
        ) {
          response.resume();
          const nextUrl = new URL(location, parsed).toString();
          resolveAndClear(checkHttp(
            nextUrl,
            monitor,
            allowPrivateTargets,
            timeoutMs,
            redirectCount + 1,
            startedAt,
            deadlineAt
          ));
          return;
        }

        response.resume();
        const isHealthy = isHealthyHttpDiagnosticStatus(monitor, statusCode);
        resolveAndClear({
          status: isHealthy ? "ok" : "failed",
          statusCode,
          responseTimeMs: Math.max(1, Date.now() - startedAt),
          errorMessage: buildHttpDiagnosticError(monitor, statusCode),
        });
      }
    );

    deadlineTimer = setTimeout(() => {
      request.destroy(new Error(`HTTP diagnostics timed out after ${timeoutMs}ms.`));
    }, remainingTimeoutMs);
    request.on("timeout", () => request.destroy(new Error(`HTTP diagnostics timed out after ${timeoutMs}ms.`)));
    request.on("error", (error) =>
      resolveAndClear({ status: "failed", statusCode: null, responseTimeMs: Math.max(1, Date.now() - startedAt), errorMessage: error.message })
    );
    request.end();
  });
}

function isHealthyHttpDiagnosticStatus(monitor: Monitor, statusCode: number | null) {
  if (statusCode === null || !isExpectedHttpStatusCode(monitor.expectedStatusCodes, statusCode)) {
    return false;
  }

  return hasExpectedStatusCodeOverride(monitor.expectedStatusCodes)
    || (statusCode >= 200 && statusCode < 300);
}

function buildHttpDiagnosticError(monitor: Monitor, statusCode: number | null) {
  if (statusCode === null || isHealthyHttpDiagnosticStatus(monitor, statusCode)) {
    return null;
  }

  if (
    statusCode >= 300
    && statusCode < 400
    && !hasExpectedStatusCodeOverride(monitor.expectedStatusCodes)
  ) {
    return `HTTP ${statusCode} redirect response was not followed within the configured redirect limit.`;
  }

  return `HTTP ${statusCode}`;
}

function resolveDiagnosticTimeout(baseTimeoutMs: number) {
  const stepped = Math.round(baseTimeoutMs * DIAGNOSTIC_TIMEOUT_RATIO);
  return Math.min(MAX_DIAGNOSTIC_TIMEOUT_MS, Math.max(MIN_DIAGNOSTIC_TIMEOUT_MS, stepped));
}

function buildDiagnosticResult(input: Partial<MonitorDiagnosticResult> & {
  createdAt: Date;
  timeoutMs: number;
  summary: string;
}) {
  const status = input.failedPhase ? "failed" : input.httpStatus === "failed" ? "partial" : "ok";

  return {
    status,
    failedPhase: input.failedPhase ?? null,
    failureCategory: input.failureCategory ?? null,
    summary: input.summary,
    dnsStatus: input.dnsStatus ?? null,
    resolvedIps: input.resolvedIps ?? [],
    tcpStatus: input.tcpStatus ?? null,
    tlsStatus: input.tlsStatus ?? null,
    httpStatus: input.httpStatus ?? null,
    httpStatusCode: input.httpStatusCode ?? null,
    responseTimeMs: input.responseTimeMs ?? null,
    timeoutMs: input.timeoutMs,
    errorMessage: input.errorMessage ?? null,
    createdAt: input.createdAt,
  } satisfies MonitorDiagnosticResult;
}

function buildSummary(httpResult: (DiagnosticStepResult & { statusCode: number | null }) | null) {
  if (!httpResult) {
    return "Network diagnostics completed for this non-HTTP target.";
  }

  if (httpResult.status === "ok") {
    return "Network diagnostics succeeded. The earlier failure may be transient or assertion-related.";
  }

  return "DNS, TCP and TLS checks passed, but the HTTP probe still did not return a healthy response.";
}

function categorizeHttpFailure(result: DiagnosticStepResult & { statusCode: number | null }): DiagnosticFailureCategory {
  if ((result.errorMessage ?? "").toLowerCase().includes("timed out")) {
    return "timeout";
  }

  if (result.statusCode && result.statusCode >= 300 && result.statusCode < 400) {
    return "redirect_error";
  }

  return result.statusCode && result.statusCode >= 400 ? "http_error" : "network_error";
}

function categorizeError(errorMessage: string | null, phase: DiagnosticPhase): DiagnosticFailureCategory {
  const error = (errorMessage ?? "").toLowerCase();

  if (error.includes("timed out")) {
    return "timeout";
  }

  if (error.includes("refused") || error.includes("econnrefused")) {
    return "connection_refused";
  }

  return phase === "tls" ? "tls_error" : "network_error";
}

function skippedStep(): DiagnosticStepResult {
  return { status: "skipped", errorMessage: null };
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : "Diagnostics step failed.";
}
