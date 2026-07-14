import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AuthError } from "@/lib/auth/errors";

export const PUBLIC_NETWORK_TARGET_ERROR = "Network targets must point to a public endpoint.";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
]);
const BLOCKED_HOST_SUFFIXES = [".internal", ".lan", ".local", ".localhost", ".localdomain"];

export async function assertPublicNetworkTarget(
  hostname: string,
  message = PUBLIC_NETWORK_TARGET_ERROR
) {
  const normalizedHostname = normalizeNetworkHostname(hostname);

  if (!isPublicNetworkHostnameLiteral(normalizedHostname)) {
    throw new AuthError(message, 400);
  }

  if (isIP(normalizedHostname)) {
    return;
  }

  let resolved: string[];
  try {
    resolved = await resolveHostname(normalizedHostname);
  } catch {
    throw new AuthError(message, 400);
  }
  if (resolved.length === 0 || resolved.some((address) => isNonPublicIpAddress(address))) {
    throw new AuthError(message, 400);
  }
}

export async function assertMonitorNetworkTarget(
  hostname: string,
  options: { allowPrivateTargets: boolean; allowUnresolved?: boolean; message?: string }
) {
  const normalizedHostname = normalizeNetworkHostname(hostname);
  if (!isMonitorNetworkHostnameLiteralAllowed(normalizedHostname, options.allowPrivateTargets)) {
    throw new AuthError(options.message ?? PUBLIC_NETWORK_TARGET_ERROR, 400);
  }

  if (isIP(normalizedHostname)) {
    return;
  }

  let resolved: string[];
  try {
    resolved = await resolveHostname(normalizedHostname);
  } catch (error) {
    if (options.allowUnresolved) {
      return;
    }
    throw error;
  }
  const isBlockedAddress = options.allowPrivateTargets ? isServerLocalIpAddress : isNonPublicIpAddress;
  if (resolved.length === 0 || resolved.some(isBlockedAddress)) {
    throw new AuthError(options.message ?? PUBLIC_NETWORK_TARGET_ERROR, 400);
  }
}

export function isPublicNetworkHostnameLiteral(hostname: string) {
  const normalizedHostname = normalizeNetworkHostname(hostname);
  if (!normalizedHostname || isBlockedNetworkHostname(normalizedHostname)) {
    return false;
  }

  return !isIP(normalizedHostname) || !isNonPublicIpAddress(normalizedHostname);
}

export function isMonitorNetworkHostnameLiteralAllowed(hostname: string, allowPrivateTargets: boolean) {
  if (!allowPrivateTargets) {
    return isPublicNetworkHostnameLiteral(hostname);
  }

  const normalizedHostname = normalizeNetworkHostname(hostname);
  if (!normalizedHostname || isServerLocalHostname(normalizedHostname)) {
    return false;
  }

  return !isIP(normalizedHostname) || !isServerLocalIpAddress(normalizedHostname);
}

export function isNonPublicIpAddress(address: string) {
  return isNonPublicIpv4(address) || isNonPublicIpv6(address);
}

export function normalizeNetworkHostname(hostname: string) {
  return stripIpv6Brackets(hostname.trim().toLowerCase()).replace(/\.+$/, "");
}

function isBlockedNetworkHostname(hostname: string) {
  if (isServerLocalHostname(hostname)) {
    return true;
  }

  if (BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return true;
  }

  return !hostname.includes(".") && !hostname.includes(":");
}

function isServerLocalHostname(hostname: string) {
  return (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".localdomain")
  );
}

async function resolveHostname(hostname: string) {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return Array.from(new Set(records.map((record) => stripIpv6Brackets(record.address))));
}

function isNonPublicIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    first === 169 && second === 254 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isServerLocalIpAddress(address: string) {
  return isServerLocalIpv4(address) || isServerLocalIpv6(address);
}

function isServerLocalIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 0 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    first >= 224
  );
}

function isNonPublicIpv6(address: string) {
  const normalized = stripIpv6Brackets(address.toLowerCase());
  const mappedIpv4 = parseIpv4MappedIpv6(normalized);
  if (mappedIpv4) {
    return isNonPublicIpv4(mappedIpv4);
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

function isServerLocalIpv6(address: string) {
  const normalized = stripIpv6Brackets(address.toLowerCase());
  const mappedIpv4 = parseIpv4MappedIpv6(normalized);
  if (mappedIpv4) {
    return isServerLocalIpv4(mappedIpv4);
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff")
  );
}

function parseIpv4MappedIpv6(address: string) {
  if (!address.startsWith("::ffff:")) {
    return null;
  }

  const suffix = address.slice("::ffff:".length);
  if (suffix.includes(".")) {
    return suffix;
  }

  const parts = suffix.split(":");
  if (parts.length !== 2) {
    return null;
  }

  const high = Number.parseInt(parts[0], 16);
  const low = Number.parseInt(parts[1], 16);
  if (![high, low].every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff)) {
    return null;
  }

  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ].join(".");
}

function stripIpv6Brackets(value: string) {
  return value.replace(/^\[/, "").replace(/\]$/, "");
}
