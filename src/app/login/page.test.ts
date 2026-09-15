import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  isOnboardingRequired: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/lib/auth/service", () => ({
  isOnboardingRequired: mocks.isOnboardingRequired,
}));

vi.mock("@/app/login/login-form", () => ({
  LoginForm: () => null,
}));

import LoginPage from "@/app/login/page";

describe("login page session redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isOnboardingRequired.mockResolvedValue(false);
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("redirects an authenticated user through the configured landing-page route", async () => {
    mocks.getSession.mockResolvedValue({ id: "user-1" });

    await expect(LoginPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("renders the login form when there is no active session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const result = await LoginPage();

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
  });

  it("redirects first-time setup before rendering the login form", async () => {
    mocks.getSession.mockResolvedValue(null);
    mocks.isOnboardingRequired.mockResolvedValue(true);

    await expect(LoginPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
  });
});
