import { isIP } from "node:net";
import type { DnsMatchMode, DnsRecordType } from "@/lib/monitors/dns-records";

const DNS_HOSTNAME_PATTERN = /^(?=.{1,253}\.?$)(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)*[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.?$/i;

export function isDnsHostname(value: string) {
  return DNS_HOSTNAME_PATTERN.test(value.trim()) && isIP(value.trim()) === 0;
}

// A DNS server is an IP address; a custom port is not supported.
export function isDnsServerAddress(value: string) {
  return isIP(value.trim()) !== 0;
}

// Expected values, one per line. TXT records keep their commas and spaces; MX values keep the space
// between priority and host; other records may also be separated by commas or spaces.
export function parseDnsExpectedValues(recordType: DnsRecordType, value: string) {
  const separator = recordType === "TXT" ? /\n/ : recordType === "MX" ? /[\n,]/ : /[\n,\s]/;
  return Array.from(new Set(
    value
      .split(separator)
      .map((item) => normalizeDnsValue(recordType, item))
      .filter((item) => item.length > 0)
  ));
}

export function findInvalidDnsExpectedValue(recordType: DnsRecordType, values: string[]) {
  return values.find((value) => {
    if (recordType === "A") return isIP(value) !== 4;
    if (recordType === "AAAA") return isIP(value) !== 6;
    if (recordType === "CNAME" || recordType === "NS") return !isDnsHostname(value);
    if (recordType === "MX") {
      const parts = value.split(" ");
      const host = parts.length === 2 ? parts[1] : parts[0];
      const priorityValid = parts.length === 1 || (parts.length === 2 && /^\d{1,5}$/.test(parts[0]));
      return !priorityValid || !isDnsHostname(host);
    }
    return false;
  }) ?? null;
}

export function normalizeDnsValue(recordType: DnsRecordType, value: string) {
  const trimmed = value.trim();
  if (recordType === "TXT") return trimmed.replace(/^"([\s\S]*)"$/, "$1");
  if (recordType === "AAAA") return normalizeIpv6(trimmed);
  return trimmed.toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
}

export type DnsEvaluation = { ok: true } | { ok: false; message: string };

// Whether the records the server returned satisfy the monitor. Without expected values, any record
// passes. "includes" needs every expected value among the records (for TXT, inside one of them);
// "exact" needs the records to be exactly the expected ones. An MX value without a priority matches
// that host at any priority.
export function evaluateDnsAnswers(
  recordType: DnsRecordType,
  host: string,
  answers: string[],
  expectedValues: string[],
  matchMode: DnsMatchMode
): DnsEvaluation {
  const label = `${recordType} records for ${host}`;
  if (answers.length === 0) {
    return { ok: false, message: `No ${label} were returned.` };
  }
  if (expectedValues.length === 0) {
    return { ok: true };
  }

  const matches = (expected: string, answer: string) => {
    if (recordType === "TXT" && matchMode === "includes") return answer.includes(expected);
    if (recordType === "MX" && !expected.includes(" ")) return answer.split(" ")[1] === expected;
    return answer === expected;
  };
  const missing = expectedValues.filter((expected) => !answers.some((answer) => matches(expected, answer)));
  const unexpected = matchMode === "exact"
    ? answers.filter((answer) => !expectedValues.some((expected) => matches(expected, answer)))
    : [];
  if (missing.length === 0 && unexpected.length === 0) {
    return { ok: true };
  }

  const found = formatDnsValues(answers);
  if (missing.length > 0) {
    return { ok: false, message: `${capitalize(label)} do not include ${formatDnsValues(missing)}. Found: ${found}.` };
  }
  return { ok: false, message: `${capitalize(label)} include unexpected ${formatDnsValues(unexpected)}. Found: ${found}.` };
}

function formatDnsValues(values: string[]) {
  const shown = values.slice(0, 5).map((value) => (value.length > 120 ? `${value.slice(0, 117)}...` : value));
  return `${shown.join(", ")}${values.length > 5 ? ` and ${values.length - 5} more` : ""}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeIpv6(value: string) {
  if (isIP(value) !== 6) return value.toLowerCase();
  try {
    return new URL(`http://[${value}]/`).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return value.toLowerCase();
  }
}
