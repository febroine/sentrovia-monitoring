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

vi.mock("@/app/onboarding/onboarding-flow", () => ({
  OnboardingFlow: () => null,
}));

import OnboardingPage from "@/app/onboarding/page";

describe("onboarding page route guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("renders onboarding only while initial setup is required", async () => {
    mocks.isOnboardingRequired.mockResolvedValue(true);

    const result = await OnboardingPage();

    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
  });

  it("returns an authenticated user to the application after setup", async () => {
    mocks.isOnboardingRequired.mockResolvedValue(false);
    mocks.getSession.mockResolvedValue({ id: "user-1" });

    await expect(OnboardingPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("sends an unauthenticated user to login after setup", async () => {
    mocks.isOnboardingRequired.mockResolvedValue(false);
    mocks.getSession.mockResolvedValue(null);

    await expect(OnboardingPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });
});
