import { Resolver } from "node:dns/promises";
import type { Monitor } from "@/lib/db/schema";
import { evaluateDnsAnswers, normalizeDnsValue, parseDnsExpectedValues } from "@/lib/monitors/dns";
import type { DnsMatchMode, DnsRecordType } from "@/lib/monitors/dns-records";
import { parseDnsMonitorTarget } from "@/lib/monitors/targets";
import { isMonitorNetworkHostnameLiteralAllowed, isNonPublicIpAddress } from "@/lib/security/public-network-target";
import { formatTimeoutDuration } from "@/worker/failure-reasons";
import type { CheckFailureReason, CheckResult } from "@/worker/types";

class DnsCheckFailure extends Error {
  constructor(message: string, readonly reason: CheckFailureReason) {
    super(message);
  }
}

// Looks up one record type for a name, with the system resolver or a chosen DNS server, and checks the
// answer against the expected values.
export async function checkDnsMonitor(monitor: Monitor, allowPrivateTargets = false): Promise<CheckResult> {
  const checkedAt = new Date();
  const startedAt = performance.now();

  try {
    const target = parseDnsMonitorTarget(monitor.url);
    if (target.server && !isMonitorNetworkHostnameLiteralAllowed(target.server, allowPrivateTargets)) {
      throw new DnsCheckFailure("The DNS server is not allowed by the current network safety policy.", "configuration");
    }

    const answers = await lookupRecords(target.host, target.recordType, target.server, monitor.timeout);
    const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
    // Without a chosen server the system resolver may answer with internal addresses, which are only
    // shown where private targets are allowed.
    if (!allowPrivateTargets && !target.server && (target.recordType === "A" || target.recordType === "AAAA")
      && answers.some((address) => isNonPublicIpAddress(address))) {
      throw new DnsCheckFailure(
        `${target.host} resolves to a non-public address, which the current network safety policy does not allow.`,
        "configuration"
      );
    }

    const recordType = target.recordType;
    const evaluation = evaluateDnsAnswers(
      recordType,
      target.host,
      answers,
      parseDnsExpectedValues(recordType, monitor.dnsExpectedValues ?? ""),
      (monitor.dnsMatchMode ?? "includes") as DnsMatchMode
    );
    if (!evaluation.ok) {
      throw new DnsCheckFailure(evaluation.message, answers.length === 0 ? "dns" : "assertion");
    }

    return { ok: true, status: "up", statusCode: null, latencyMs, errorMessage: null, checkedAt, sslExpiresAt: null };
  } catch (error) {
    const failure = toDnsFailure(error, monitor);
    return {
      ok: false,
      status: "down",
      statusCode: null,
      latencyMs: null,
      errorMessage: failure.message,
      failureReason: failure.reason,
      checkedAt,
      sslExpiresAt: null,
    };
  }
}

async function lookupRecords(host: string, recordType: DnsRecordType, server: string, timeoutMs: number) {
  // Two tries inside the monitor timeout; the outer deadline cancels anything still pending.
  const resolver = new Resolver({ timeout: Math.max(500, Math.floor(timeoutMs / 2)), tries: 2 });
  if (server) resolver.setServers([server]);

  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      resolver.cancel();
      reject(Object.assign(new Error("DNS lookup timed out."), { code: "ETIMEOUT" }));
    }, timeoutMs);
  });

  try {
    return await Promise.race([queryRecords(resolver, host, recordType), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function queryRecords(resolver: Resolver, host: string, recordType: DnsRecordType): Promise<string[]> {
  const values = await (async () => {
    switch (recordType) {
      case "A":
        return resolver.resolve4(host);
      case "AAAA":
        return resolver.resolve6(host);
      case "CNAME":
        return resolver.resolveCname(host);
      case "NS":
        return resolver.resolveNs(host);
      case "MX":
        return (await resolver.resolveMx(host)).map((record) => `${record.priority} ${record.exchange}`);
      case "TXT":
        return (await resolver.resolveTxt(host)).map((chunks) => chunks.join(""));
    }
  })();
  return Array.from(new Set(values.map((value) => normalizeDnsValue(recordType, value)))).sort();
}

function toDnsFailure(error: unknown, monitor: Monitor): { message: string; reason: CheckFailureReason } {
  if (error instanceof DnsCheckFailure) {
    return { message: error.message, reason: error.reason };
  }

  const target = parseDnsMonitorTarget(monitor.url);
  const code = (error as NodeJS.ErrnoException | null)?.code;
  const server = target.server ? `DNS server ${target.server}` : "The DNS server";
  switch (code) {
    case "ENOTFOUND":
      return { message: `${target.host} does not exist (NXDOMAIN).`, reason: "dns" };
    case "ENODATA":
      return { message: `No ${target.recordType} records for ${target.host} were returned.`, reason: "dns" };
    case "ETIMEOUT":
    case "ECANCELLED":
      return { message: `${server} did not answer within ${formatTimeoutDuration(monitor.timeout)}.`, reason: "timeout" };
    case "ESERVFAIL":
      return { message: `${server} could not resolve ${target.host} (SERVFAIL).`, reason: "dns" };
    case "EREFUSED":
      return { message: `${server} refused the query for ${target.host}.`, reason: "dns" };
    case "ECONNREFUSED":
      return { message: `${server} could not be reached.`, reason: "dns" };
    default:
      return {
        message: error instanceof Error ? `DNS lookup failed: ${error.message}` : "DNS lookup failed.",
        reason: "dns",
      };
  }
}
