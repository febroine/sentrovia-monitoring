import crypto from "node:crypto";
import { inArray, lt, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { db } from "@/lib/db";
import { authRateLimits } from "@/lib/db/schema";

type AuthAction = "login" | "onboarding" | "change-password";

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
  login: { windowMs: 10 * 60_000, maxAttempts: 8, blockMs: 15 * 60_000 },
  onboarding: { windowMs: 30 * 60_000, maxAttempts: 5, blockMs: 30 * 60_000 },
  "change-password": { windowMs: 15 * 60_000, maxAttempts: 6, blockMs: 20 * 60_000 },
};

const MAX_TEST_RATE_LIMIT_ENTRIES = 10_000;
const IDENTIFIER_ONLY_ATTEMPT_MULTIPLIER = 2;
const IDENTIFIER_ONLY_BLOCK_MS = 5 * 60_000;
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60_000;
const CLEANUP_INTERVAL = 100;
const MAX_CONCURRENT_AUTH_WORK = 8;
const testRateLimitStore = new Map<string, RateLimitEntry>();
let cleanupCounter = 0;
let activeAuthWork = 0;

export async function assertAuthRateLimit(
  request: NextRequest,
  action: AuthAction,
  identifier?: string | null
) {
  const keys = buildRateLimitKeys(request, action, identifier);
  if (process.env.NODE_ENV === "test") {
    assertTestRateLimit(keys, action);
    return;
  }

  const rows = await db
    .select({ blockedUntil: authRateLimits.blockedUntil })
    .from(authRateLimits)
    .where(inArray(authRateLimits.rateKey, keys.map(hashRateLimitKey)));
  if (rows.some((row) => row.blockedUntil && row.blockedUntil.getTime() > Date.now())) {
    throw buildRateLimitError();
  }
}

export async function recordAuthFailure(
  request: NextRequest,
  action: AuthAction,
  identifier?: string | null
) {
  const keys = buildRateLimitKeys(request, action, identifier);
  if (process.env.NODE_ENV === "test") {
    recordTestFailures(keys, action);
    return;
  }

  await Promise.all(keys.map((key) => persistFailure(key, action)));
  await maybeCleanupPersistentEntries();
}

export async function clearAuthFailures(
  request: NextRequest,
  action: AuthAction,
  identifier?: string | null
) {
  const keys = buildRateLimitKeys(request, action, identifier);
  if (process.env.NODE_ENV === "test") {
    keys.forEach((key) => testRateLimitStore.delete(key));
    return;
  }

  await db
    .delete(authRateLimits)
    .where(inArray(authRateLimits.rateKey, keys.map(hashRateLimitKey)));
}

export async function runBoundedAuthWork<T>(task: () => Promise<T>) {
  if (activeAuthWork >= MAX_CONCURRENT_AUTH_WORK) {
    throw new AuthError("Authentication is temporarily busy. Please try again shortly.", 429);
  }

  activeAuthWork += 1;
  try {
    return await task();
  } finally {
    activeAuthWork = Math.max(0, activeAuthWork - 1);
  }
}

async function persistFailure(key: string, action: AuthAction) {
  const rule = resolveRuleForKey(key, action);
  const now = new Date();
  const resetCondition = sql`${authRateLimits.windowStartedAt} + (${rule.windowMs} * interval '1 millisecond') <= now()
    AND coalesce(${authRateLimits.blockedUntil}, to_timestamp(0)) <= now()`;

  await db
    .insert(authRateLimits)
    .values({ rateKey: hashRateLimitKey(key), action, attempts: 1, windowStartedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: authRateLimits.rateKey,
      set: {
        action,
        attempts: sql`case when ${resetCondition} then 1 else ${authRateLimits.attempts} + 1 end`,
        windowStartedAt: sql`case when ${resetCondition} then now() else ${authRateLimits.windowStartedAt} end`,
        blockedUntil: sql`case
          when ${resetCondition} then null
          when ${authRateLimits.attempts} + 1 >= ${rule.maxAttempts}
            then now() + (${rule.blockMs} * interval '1 millisecond')
          else ${authRateLimits.blockedUntil}
        end`,
        updatedAt: now,
      },
    });
}

async function maybeCleanupPersistentEntries() {
  cleanupCounter = (cleanupCounter + 1) % CLEANUP_INTERVAL;
  if (cleanupCounter !== 0) return;
  await db
    .delete(authRateLimits)
    .where(lt(authRateLimits.updatedAt, new Date(Date.now() - RATE_LIMIT_RETENTION_MS)));
}

function buildRateLimitKeys(
  request: NextRequest,
  action: AuthAction,
  identifier?: string | null
) {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  const clientIp = readClientIp(request);
  const keys: string[] = [];
  if (clientIp) keys.push(`${action}:ip:${clientIp}`);
  if (normalizedIdentifier) {
    keys.push(`${action}:id:${normalizedIdentifier}`);
    if (clientIp) keys.push(`${action}:ip:${clientIp}:id:${normalizedIdentifier}`);
  }
  return keys.length > 0 ? keys : [`${action}:anonymous`];
}

function readClientIp(request: NextRequest) {
  if (process.env.AUTH_TRUST_PROXY_HEADERS !== "true") return null;
  const forwarded = request.headers.get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (forwarded?.length) {
    return forwarded[Math.max(0, forwarded.length - readTrustedProxyCount())] ?? null;
  }
  return request.headers.get("x-real-ip")?.trim() || null;
}

function readTrustedProxyCount() {
  const parsed = Number.parseInt(process.env.AUTH_TRUSTED_PROXY_COUNT ?? "1", 10);
  return Number.isInteger(parsed) ? Math.min(10, Math.max(1, parsed)) : 1;
}

function normalizeIdentifier(identifier?: string | null) {
  const value = identifier?.trim().toLowerCase();
  return value && value.length > 0 ? value : null;
}

function resolveRuleForKey(key: string, action: AuthAction) {
  const rule = RATE_LIMITS[action];
  return key.startsWith(`${action}:id:`)
    ? { ...rule, maxAttempts: rule.maxAttempts * IDENTIFIER_ONLY_ATTEMPT_MULTIPLIER, blockMs: IDENTIFIER_ONLY_BLOCK_MS }
    : rule;
}

function hashRateLimitKey(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function buildRateLimitError() {
  return new AuthError("Too many authentication attempts. Please wait a few minutes and try again.", 429);
}

function assertTestRateLimit(keys: string[], action: AuthAction) {
  const now = Date.now();
  cleanupTestStore(now);
  for (const key of keys) {
    if (getActiveTestEntry(key, resolveRuleForKey(key, action), now).blockedUntil > now) {
      throw buildRateLimitError();
    }
  }
}

function recordTestFailures(keys: string[], action: AuthAction) {
  const now = Date.now();
  cleanupTestStore(now);
  for (const key of keys) {
    const rule = resolveRuleForKey(key, action);
    const current = getActiveTestEntry(key, rule, now);
    const attempts = current.attempts + 1;
    testRateLimitStore.set(key, {
      attempts,
      windowStartedAt: current.windowStartedAt,
      blockedUntil: attempts >= rule.maxAttempts ? now + rule.blockMs : 0,
    });
  }
  while (testRateLimitStore.size > MAX_TEST_RATE_LIMIT_ENTRIES) {
    const oldestKey = testRateLimitStore.keys().next().value;
    if (!oldestKey) break;
    testRateLimitStore.delete(oldestKey);
  }
}

function getActiveTestEntry(key: string, rule: RateLimitRule, now: number): RateLimitEntry {
  const entry = testRateLimitStore.get(key);
  if (!entry || (entry.windowStartedAt + rule.windowMs <= now && entry.blockedUntil <= now)) {
    testRateLimitStore.delete(key);
    return { attempts: 0, windowStartedAt: now, blockedUntil: 0 };
  }
  return entry;
}

function cleanupTestStore(now: number) {
  for (const [key, entry] of testRateLimitStore) {
    const expired = entry.blockedUntil > 0
      ? entry.blockedUntil <= now
      : entry.windowStartedAt + RATE_LIMIT_RETENTION_MS <= now;
    if (expired) testRateLimitStore.delete(key);
  }
}

export function resetAuthRateLimitForTests() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Rate limit reset is only available during tests.");
  }
  testRateLimitStore.clear();
  activeAuthWork = 0;
}
