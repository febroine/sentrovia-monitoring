import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { AuthError } from "@/lib/auth/errors";

export const PUBLIC_NETWORK_TARGET_ERROR = "Network targets must point to a public endpoint.";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
]);
const BLOCKED_HOST_SUFFIXES = [".internal", ".lan", ".local", ".localhost", ".localdomain"];

export type ResolvedNetworkAddress = {
  address: string;
  family: 4 | 6;
};

export type ResolvedNetworkTarget = {
  hostname: string;
  addresses: ResolvedNetworkAddress[];
};

export async function assertPublicNetworkTarget(
  hostname: string,
  message = PUBLIC_NETWORK_TARGET_ERROR
) {
  try {
    await resolvePublicNetworkTarget(hostname, message);
  } catch {
    throw new AuthError(message, 400);
  }
}

export async function resolvePublicNetworkTarget(
  hostname: string,
  message = PUBLIC_NETWORK_TARGET_ERROR
) {
  return resolveNetworkTarget(hostname, {
    allowPrivateTargets: false,
    message,
  });
}

export async function assertMonitorNetworkTarget(
  hostname: string,
  options: { allowPrivateTargets: boolean; allowUnresolved?: boolean; message?: string }
) {
  try {
    await resolveNetworkTarget(hostname, options);
  } catch (error) {
    if (options.allowUnresolved && !(error instanceof AuthError)) {
      return;
    }
    throw error;
  }
}

export async function assertMonitorNetworkTargetWithTimeout(
  hostname: string,
  options: { allowPrivateTargets: boolean; allowUnresolved?: boolean; message?: string },
  timeoutMs: number
) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Network target resolution timed out.")), Math.max(1, timeoutMs));
  });

  try {
    return await Promise.race([assertMonitorNetworkTarget(hostname, options), timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function resolveMonitorNetworkTargetWithTimeout(
  hostname: string,
  options: { allowPrivateTargets: boolean; message?: string },
  timeoutMs: number
) {
  return withResolutionTimeout(
    resolveNetworkTarget(hostname, options),
    timeoutMs
  );
}

export function createPinnedLookup(target: ResolvedNetworkTarget): LookupFunction {
  return (_hostname, options, callback) => {
    const requestedFamily = typeof options.family === "number" ? options.family : 0;
    const candidates = requestedFamily === 4 || requestedFamily === 6
      ? target.addresses.filter((item) => item.family === requestedFamily)
      : target.addresses;

    if (candidates.length === 0) {
      const error = Object.assign(new Error("No validated address matches the requested IP family."), {
        code: "EADDRNOTAVAIL",
      });
      queueMicrotask(() => callback(error, "", requestedFamily || undefined));
      return;
    }

    if (options.all) {
      queueMicrotask(() => callback(null, candidates));
      return;
    }

    const selected = candidates[0];
    queueMicrotask(() => callback(null, selected.address, selected.family));
  };
}

export function selectResolvedAddress(
  target: ResolvedNetworkTarget,
  family?: 4 | 6 | null
) {
  const selected = family
    ? target.addresses.find((item) => item.family === family)
    : target.addresses[0];

  if (!selected) {
    throw Object.assign(new Error("No validated address matches the requested IP family."), {
      code: "EADDRNOTAVAIL",
    });
  }

  return selected.address;
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
  const normalized = stripIpv6Brackets(hostname.trim().toLowerCase()).replace(/\.+$/, "");
  return normalizeIpAddress(normalized);
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

async function resolveNetworkTarget(
  hostname: string,
  options: { allowPrivateTargets: boolean; message?: string }
): Promise<ResolvedNetworkTarget> {
  const normalizedHostname = normalizeNetworkHostname(hostname);
  const message = options.message ?? PUBLIC_NETWORK_TARGET_ERROR;

  if (!isMonitorNetworkHostnameLiteralAllowed(normalizedHostname, options.allowPrivateTargets)) {
    throw new AuthError(message, 400);
  }

  const literalFamily = isIP(normalizedHostname);
  const addresses = literalFamily
    ? [{ address: normalizedHostname, family: literalFamily as 4 | 6 }]
    : await resolveHostname(normalizedHostname);
  const isBlockedAddress = options.allowPrivateTargets ? isServerLocalIpAddress : isNonPublicIpAddress;

  if (addresses.length === 0 || addresses.some((item) => isBlockedAddress(item.address))) {
    throw new AuthError(message, 400);
  }

  return { hostname: normalizedHostname, addresses };
}

async function withResolutionTimeout<T>(operation: Promise<T>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Network target resolution timed out.")),
      Math.max(1, timeoutMs)
    );
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function resolveHostname(hostname: string): Promise<ResolvedNetworkAddress[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  const unique = new Map<string, ResolvedNetworkAddress>();

  for (const record of records) {
    const address = stripIpv6Brackets(record.address);
    unique.set(`${record.family}:${address}`, {
      address,
      family: record.family === 6 ? 6 : 4,
    });
  }

  return Array.from(unique.values());
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
  const normalized = normalizeIpAddress(address);
  const mappedIpv4 = parseIpv4MappedIpv6(normalized);
  if (mappedIpv4) {
    return isNonPublicIpv4(mappedIpv4);
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("::") ||
    normalized.startsWith("64:ff9b:") ||
    normalized.startsWith("100:") ||
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fec") ||
    normalized.startsWith("fed") ||
    normalized.startsWith("fee") ||
    normalized.startsWith("fef") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff")
  );
}

function isServerLocalIpv6(address: string) {
  const normalized = normalizeIpAddress(address);
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

function normalizeIpAddress(address: string) {
  const normalized = stripIpv6Brackets(address.trim().toLowerCase());
  if (isIP(normalized) !== 6) {
    return normalized;
  }

  try {
    return stripIpv6Brackets(new URL(`http://[${normalized}]/`).hostname.toLowerCase());
  } catch {
    return normalized;
  }
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
