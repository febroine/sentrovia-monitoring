import { lookup } from "node:dns/promises";
import { AuthError } from "@/lib/auth/errors";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "::",
]);

const BLOCKED_HOST_SUFFIXES = [".internal", ".lan", ".local", ".localhost", ".localdomain"];

export async function assertSafeWebhookUrl(value: string) {
  const parsed = parseWebhookUrl(value);
  await assertPublicHostname(parsed.hostname);
  return parsed.toString();
}

export function isWebhookSafetyError(error: unknown) {
  return error instanceof AuthError;
}

function parseWebhookUrl(value: string) {
  let parsed: URL;

  try {
    parsed = new URL(value.trim());
  } catch {
    throw new AuthError("Enter a valid public webhook endpoint URL.", 400);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new AuthError("Webhook targets must use http or https.", 400);
  }

  if (parsed.username || parsed.password) {
    throw new AuthError("Webhook URLs cannot include inline credentials.", 400);
  }

  return parsed;
}

async function assertPublicHostname(hostname: string) {
  const normalizedHostname = hostname.trim().toLowerCase();

  if (isBlockedHostname(normalizedHostname)) {
    throw new AuthError("Webhook targets must point to a public webhook endpoint.", 400);
  }

  const resolved = await resolveHostname(normalizedHostname);
  if (resolved.length === 0 || resolved.some((address) => isPrivateAddress(address))) {
    throw new AuthError("Webhook targets must point to a public webhook endpoint.", 400);
  }
}

function isBlockedHostname(hostname: string) {
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return true;
  }

  if (BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return true;
  }

  return !hostname.includes(".") && !hostname.includes(":");
}

async function resolveHostname(hostname: string) {
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return Array.from(new Set(records.map((record) => record.address)));
  } catch {
    throw new AuthError("Unable to resolve the webhook endpoint host.", 400);
  }
}

function isPrivateAddress(address: string) {
  return isPrivateIpv4(address) || isPrivateIpv6(address);
}

function isPrivateIpv4(address: string) {
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

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();

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
