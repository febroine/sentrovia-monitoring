import type { NextRequest } from "next/server";
import { AuthError } from "@/lib/auth/errors";

type AuthAction = "login" | "register" | "change-password";

type RateLimitRule = {
  windowMs: number;
  maxAttempts: number;
  blockMs: number;
};

type RateLimitEntry = {
  attempts: number;
  windowStartedAt: number;
  blockedUntil: number;
};

const RATE_LIMITS: Record<AuthAction, RateLimitRule> = {
  login: {
    windowMs: 10 * 60 * 1000,
    maxAttempts: 8,
    blockMs: 15 * 60 * 1000,
  },
  register: {
    windowMs: 30 * 60 * 1000,
    maxAttempts: 5,
    blockMs: 30 * 60 * 1000,
  },
  "change-password": {
    windowMs: 15 * 60 * 1000,
    maxAttempts: 6,
    blockMs: 20 * 60 * 1000,
  },
};

const rateLimitStore = new Map<string, RateLimitEntry>();

export function assertAuthRateLimit(
  request: NextRequest,
  action: AuthAction,
  identifier?: string | null
) {
  const now = Date.now();
  const rule = RATE_LIMITS[action];
  const keys = buildRateLimitKeys(request, action, identifier);

  cleanupRateLimitStore(now);

  for (const key of keys) {
    const entry = getActiveEntry(key, rule, now);
    if (entry.blockedUntil > now) {
      throw new AuthError("Too many authentication attempts. Please wait a few minutes and try again.", 429);
    }
  }
}

export function recordAuthFailure(
  request: NextRequest,
  action: AuthAction,
  identifier?: string | null
) {
  const now = Date.now();
  const rule = RATE_LIMITS[action];
  const keys = buildRateLimitKeys(request, action, identifier);

  cleanupRateLimitStore(now);

  for (const key of keys) {
    const current = getActiveEntry(key, rule, now);
    const attempts = current.attempts + 1;
    const blockedUntil = attempts >= rule.maxAttempts ? now + rule.blockMs : 0;

    rateLimitStore.set(key, {
      attempts,
      windowStartedAt: current.windowStartedAt,
      blockedUntil,
    });
  }
}

export function clearAuthFailures(
  request: NextRequest,
  action: AuthAction,
  identifier?: string | null
) {
  for (const key of buildRateLimitKeys(request, action, identifier)) {
    rateLimitStore.delete(key);
  }
}

function buildRateLimitKeys(
  request: NextRequest,
  action: AuthAction,
  identifier?: string | null
) {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  const clientIp = readClientIp(request);
  const keys = [`${action}:ip:${clientIp}`];

  if (normalizedIdentifier) {
    keys.push(`${action}:ip:${clientIp}:id:${normalizedIdentifier}`);
  }

  return keys;
}

function readClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function normalizeIdentifier(identifier?: string | null) {
  const value = identifier?.trim().toLowerCase();
  return value && value.length > 0 ? value : null;
}

function getActiveEntry(key: string, rule: RateLimitRule, now: number) {
  const entry = rateLimitStore.get(key);

  if (!entry) {
    return {
      attempts: 0,
      windowStartedAt: now,
      blockedUntil: 0,
    };
  }

  if (entry.windowStartedAt + rule.windowMs <= now && entry.blockedUntil <= now) {
    rateLimitStore.delete(key);
    return {
      attempts: 0,
      windowStartedAt: now,
      blockedUntil: 0,
    };
  }

  return entry;
}

function cleanupRateLimitStore(now: number) {
  for (const [key, entry] of rateLimitStore.entries()) {
    const shouldDelete = entry.blockedUntil > 0 ? entry.blockedUntil <= now : entry.windowStartedAt + 60 * 60 * 1000 <= now;
    if (shouldDelete) {
      rateLimitStore.delete(key);
    }
  }
}
