import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { POST } from "@/app/api/auth/onboarding/route";
import { applySessionCookie } from "@/lib/auth/session";
import { createInitialAdmin } from "@/lib/auth/service";
import { assertAuthRateLimit, clearAuthFailures, recordAuthFailure } from "@/lib/auth/rate-limit";

vi.mock("@/lib/auth/session", () => ({
  applySessionCookie: vi.fn((response: NextResponse) => response),
}));

vi.mock("@/lib/auth/service", () => ({
  createInitialAdmin: vi.fn(),
  isOnboardingRequired: vi.fn(),
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  assertAuthRateLimit: vi.fn(),
  clearAuthFailures: vi.fn(),
  recordAuthFailure: vi.fn(),
}));

const validPayload = {
  firstName: "Test",
  lastName: "Admin",
  username: "test-admin",
  email: "ADMIN@EXAMPLE.COM",
  password: "StrongPass!123",
  confirmPassword: "StrongPass!123",
};

describe("onboarding route rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createInitialAdmin).mockResolvedValue({
      token: "session-token",
      user: {
        id: "user-1",
        activeWorkspaceId: "workspace-1",
        firstName: "Test",
        lastName: "Admin",
        email: "admin@example.com",
        department: null,
        role: "admin",
        fullName: "Test Admin",
        createdAt: "2026-09-12T00:00:00.000Z",
      },
    });
  });

  it("checks the persistent limiter before starting account creation", async () => {
    vi.mocked(assertAuthRateLimit).mockRejectedValueOnce(
      new AuthError("Too many authentication attempts. Please try again later.", 429)
    );

    const response = await POST(buildRequest(validPayload));

    expect(response.status).toBe(429);
    expect(assertAuthRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), "onboarding");
    expect(createInitialAdmin).not.toHaveBeenCalled();
  });

  it("clears prior failures after successful onboarding", async () => {
    const response = await POST(buildRequest(validPayload));

    expect(response.status).toBe(201);
    expect(clearAuthFailures).toHaveBeenCalledWith(expect.any(NextRequest), "onboarding");
    expect(applySessionCookie).toHaveBeenCalledWith(expect.any(NextResponse), "session-token");
    expect(recordAuthFailure).not.toHaveBeenCalled();
  });

  it("records a failed creation attempt after validation succeeds", async () => {
    vi.mocked(createInitialAdmin).mockRejectedValueOnce(
      new AuthError("Workspace onboarding is already complete.", 409)
    );

    const response = await POST(buildRequest(validPayload));

    expect(response.status).toBe(409);
    expect(recordAuthFailure).toHaveBeenCalledWith(expect.any(NextRequest), "onboarding");
  });
});

function buildRequest(body: unknown) {
  return new NextRequest("https://sentrovia.example/api/auth/onboarding", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://sentrovia.example",
    },
    body: JSON.stringify(body),
  });
}
