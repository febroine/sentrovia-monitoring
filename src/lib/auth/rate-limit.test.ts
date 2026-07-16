import { beforeEach, describe, expect, it } from "vitest";
import { AuthError } from "@/lib/auth/errors";
import { assertAuthRateLimit, recordAuthFailure, resetAuthRateLimitForTests } from "@/lib/auth/rate-limit";

describe("auth rate limiting", () => {
  beforeEach(() => {
    resetAuthRateLimitForTests();
    delete process.env.AUTH_TRUST_PROXY_HEADERS;
  });

  it("blocks repeated login failures for the same identifier even when forwarded IP changes", () => {
    const email = "rate-limit-login@example.com";

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const request = buildRequest(`203.0.113.${attempt + 1}`);
      assertAuthRateLimit(request, "login", email);
      recordAuthFailure(request, "login", email);
    }

    expect(() =>
      assertAuthRateLimit(buildRequest("203.0.113.99"), "login", email)
    ).toThrow(AuthError);
  });

  it("blocks repeated onboarding failures for the same identifier even when forwarded IP changes", () => {
    const email = "rate-limit-onboarding@example.com";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const request = buildRequest(`198.51.100.${attempt + 1}`);
      assertAuthRateLimit(request, "onboarding", email);
      recordAuthFailure(request, "onboarding", email);
    }

    expect(() =>
      assertAuthRateLimit(buildRequest("198.51.100.99"), "onboarding", email)
    ).toThrow(AuthError);
  });

  it("keeps the in-memory limiter bounded under many unique identifiers", () => {
    process.env.AUTH_TRUST_PROXY_HEADERS = "true";

    for (let attempt = 0; attempt < 4000; attempt += 1) {
      recordAuthFailure(
        buildRequest(`203.0.113.${attempt % 255}`),
        "login",
        `spray-${attempt}@example.com`
      );
    }

    const freshEmail = "fresh-login@example.com";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      recordAuthFailure(buildRequest("203.0.113.250"), "login", freshEmail);
    }

    expect(() => assertAuthRateLimit(buildRequest("203.0.113.250"), "login", freshEmail)).toThrow(AuthError);
  });

  it("does not trust spoofable forwarded IP headers unless explicitly enabled", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const request = buildRequest(`198.51.100.${attempt + 1}`);
      assertAuthRateLimit(request, "onboarding", null);
      recordAuthFailure(request, "onboarding", null);
    }

    expect(() => assertAuthRateLimit(buildRequest("198.51.100.99"), "onboarding", null)).toThrow(AuthError);
  });

  it("does not globally lock out unrelated identifiers when client IP is unavailable", () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      recordAuthFailure(
        buildRequest(`203.0.113.${attempt + 1}`),
        "login",
        `failed-${attempt}@example.com`
      );
    }

    expect(() =>
      assertAuthRateLimit(buildRequest("203.0.113.99"), "login", "fresh@example.com")
    ).not.toThrow();
  });
});

function buildRequest(forwardedFor: string) {
  return {
    headers: {
      get(name: string) {
        if (name.toLowerCase() === "x-forwarded-for") {
          return forwardedFor;
        }

        return null;
      },
    },
  } as Parameters<typeof assertAuthRateLimit>[0];
}
