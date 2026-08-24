import { beforeEach, describe, expect, it } from "vitest";
import { AuthError } from "@/lib/auth/errors";
import { assertAuthRateLimit, recordAuthFailure, resetAuthRateLimitForTests } from "@/lib/auth/rate-limit";

describe("auth rate limiting", () => {
  beforeEach(() => {
    resetAuthRateLimitForTests();
    delete process.env.AUTH_TRUST_PROXY_HEADERS;
  });

  it("uses a bounded threshold for identifier-only login failures", async () => {
    const email = "rate-limit-login@example.com";

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const request = buildRequest(`203.0.113.${attempt + 1}`);
      await assertAuthRateLimit(request, "login", email);
      await recordAuthFailure(request, "login", email);
    }

    await expect(assertAuthRateLimit(buildRequest("203.0.113.99"), "login", email))
      .rejects.toBeInstanceOf(AuthError);
  });

  it("uses a bounded threshold for identifier-only onboarding failures", async () => {
    const email = "rate-limit-onboarding@example.com";

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const request = buildRequest(`198.51.100.${attempt + 1}`);
      await assertAuthRateLimit(request, "onboarding", email);
      await recordAuthFailure(request, "onboarding", email);
    }

    await expect(assertAuthRateLimit(buildRequest("198.51.100.99"), "onboarding", email))
      .rejects.toBeInstanceOf(AuthError);
  });

  it("keeps the test limiter bounded under many unique identifiers", async () => {
    process.env.AUTH_TRUST_PROXY_HEADERS = "true";

    for (let attempt = 0; attempt < 4000; attempt += 1) {
      await recordAuthFailure(
        buildRequest(`203.0.113.${attempt % 255}`),
        "login",
        `spray-${attempt}@example.com`
      );
    }

    const freshEmail = "fresh-login@example.com";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await recordAuthFailure(buildRequest("203.0.113.250"), "login", freshEmail);
    }

    await expect(assertAuthRateLimit(buildRequest("203.0.113.250"), "login", freshEmail))
      .rejects.toBeInstanceOf(AuthError);
  });

  it("does not trust spoofable forwarded IP headers unless explicitly enabled", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const request = buildRequest(`198.51.100.${attempt + 1}`);
      await assertAuthRateLimit(request, "onboarding", null);
      await recordAuthFailure(request, "onboarding", null);
    }

    await expect(assertAuthRateLimit(buildRequest("198.51.100.99"), "onboarding", null))
      .rejects.toBeInstanceOf(AuthError);
  });

  it("does not globally lock out unrelated identifiers when client IP is unavailable", async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await recordAuthFailure(
        buildRequest(`203.0.113.${attempt + 1}`),
        "login",
        `failed-${attempt}@example.com`
      );
    }

    await expect(assertAuthRateLimit(buildRequest("203.0.113.99"), "login", "fresh@example.com"))
      .resolves.toBeUndefined();
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
