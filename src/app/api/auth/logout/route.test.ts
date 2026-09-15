import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  invalidateUserSessions: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...original,
    getSession: mocks.getSession,
  };
});

vi.mock("@/lib/auth/service", () => ({
  invalidateUserSessions: mocks.invalidateUserSessions,
}));

import { POST } from "@/app/api/auth/logout/route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/token";

describe("logout session revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invalidateUserSessions.mockResolvedValue(undefined);
  });

  it("invalidates copied tokens before clearing the browser cookie", async () => {
    mocks.getSession.mockResolvedValue({ id: "user-1" });

    const response = await POST(new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { origin: "http://localhost" },
    }));

    expect(response.status).toBe(200);
    expect(mocks.invalidateUserSessions).toHaveBeenCalledWith("user-1");
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe("");
  });

  it("still clears an invalid or expired browser session without mutating an account", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await POST(new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { origin: "http://localhost" },
    }));

    expect(response.status).toBe(200);
    expect(mocks.invalidateUserSessions).not.toHaveBeenCalled();
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe("");
  });

  it("clears the local cookie even when server-side revocation fails", async () => {
    mocks.getSession.mockResolvedValue({ id: "user-1" });
    mocks.invalidateUserSessions.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { origin: "http://localhost" },
    }));

    expect(response.status).toBe(500);
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe("");
  });
});
