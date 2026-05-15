import { describe, expect, it } from "vitest";
import { AuthError } from "@/lib/auth/errors";
import { assertAuthRateLimit, recordAuthFailure } from "@/lib/auth/rate-limit";

describe("auth rate limiting", () => {
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

  it("blocks repeated register failures for the same identifier even when forwarded IP changes", () => {
    const email = "rate-limit-register@example.com";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const request = buildRequest(`198.51.100.${attempt + 1}`);
      assertAuthRateLimit(request, "register", email);
      recordAuthFailure(request, "register", email);
    }

    expect(() =>
      assertAuthRateLimit(buildRequest("198.51.100.99"), "register", email)
    ).toThrow(AuthError);
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
