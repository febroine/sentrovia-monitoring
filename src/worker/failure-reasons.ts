import type { CheckFailureReason } from "@/worker/types";

export function classifyFailureMessage(
  message: string,
  fallback: CheckFailureReason = "network"
): CheckFailureReason {
  const normalized = message.toLowerCase();

  if (normalized.includes("etimedout") || normalized.includes("timed out") || normalized.includes("timeout")) {
    return "timeout";
  }

  if (
    normalized.includes("enotfound")
    || normalized.includes("eai_again")
    || normalized.includes("getaddrinfo")
    || normalized.includes("dns")
  ) {
    return "dns";
  }

  if (normalized.includes("certificate") || normalized.includes("ssl") || normalized.includes("tls")) {
    return "tls";
  }

  if (
    normalized.includes("econnrefused")
    || normalized.includes("econnreset")
    || normalized.includes("ehostunreach")
    || normalized.includes("enetunreach")
    || normalized.includes("refused")
  ) {
    return "connection";
  }

  return fallback;
}

export function formatTimeoutDuration(timeoutMs: number) {
  if (timeoutMs >= 1000 && timeoutMs % 1000 === 0) {
    return `${timeoutMs / 1000}s`;
  }

  return `${timeoutMs}ms`;
}
