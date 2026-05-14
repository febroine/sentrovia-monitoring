import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import type { Monitor } from "@/lib/db/schema";
import {
  parsePingMonitorTarget,
  parsePortMonitorTarget,
  parsePostgresMonitorTarget,
} from "@/lib/monitors/targets";
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

interface DiagnosticTarget {
  host: string;
  port: number | null;
  protocol: "http:" | "https:" | "tcp:" | "dns:";
  url: string | null;
}

export async function runMonitorDiagnostics(monitor: Monitor): Promise<MonitorDiagnosticResult> {
  const createdAt = new Date();
  const timeoutMs = resolveDiagnosticTimeout(monitor.timeout);
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

  const dnsResult = await checkDns(target.host);
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
  const tcpResult = targetWithPort ? await checkTcp(targetWithPort, timeoutMs) : skippedStep();
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
    ? await checkTls(targetWithPort, monitor, timeoutMs)
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

  const httpResult = target.url ? await checkHttp(target.url, monitor, timeoutMs) : null;
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

async function checkDns(host: string): Promise<DiagnosticStepResult & { addresses: string[] }> {
  try {
    const records = await dns.lookup(host, { all: true });
    return {
      status: records.length > 0 ? "ok" : "failed",
      addresses: records.map((record) => record.address),
      errorMessage: records.length > 0 ? null : "DNS lookup returned no addresses.",
    };
  } catch (error) {
    return { status: "failed", addresses: [], errorMessage: formatError(error) };
  }
}

function checkTcp(target: DiagnosticTarget & { port: number }, timeoutMs: number): Promise<DiagnosticStepResult> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: target.host, port: target.port });
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
  monitor: Monitor,
  timeoutMs: number
): Promise<DiagnosticStepResult> {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: target.host,
      port: target.port,
      servername: target.host,
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

function checkHttp(url: string, monitor: Monitor, timeoutMs: number) {
  const startedAt = Date.now();

  return new Promise<DiagnosticStepResult & { statusCode: number | null; responseTimeMs: number | null }>((resolve) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;
    const request = transport.request(
      parsed,
      {
        method: monitor.method,
        timeout: timeoutMs,
        rejectUnauthorized: parsed.protocol === "https:" ? !monitor.ignoreSslErrors : undefined,
      },
      (response) => {
        response.resume();
        const statusCode = response.statusCode ?? null;
        resolve({
          status: statusCode && statusCode >= 200 && statusCode < 400 ? "ok" : "failed",
          statusCode,
          responseTimeMs: Math.max(1, Date.now() - startedAt),
          errorMessage: statusCode && statusCode >= 400 ? `HTTP ${statusCode}` : null,
        });
      }
    );

    request.on("timeout", () => request.destroy(new Error(`HTTP diagnostics timed out after ${timeoutMs}ms.`)));
    request.on("error", (error) =>
      resolve({ status: "failed", statusCode: null, responseTimeMs: Math.max(1, Date.now() - startedAt), errorMessage: error.message })
    );
    request.end();
  });
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
