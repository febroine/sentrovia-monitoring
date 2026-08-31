import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "@/app/api/me/profile/route";
import { recordAuditEventSafely } from "@/lib/audit/service";
import { applySessionCookie, getSession } from "@/lib/auth/session";
import { createSessionToken } from "@/lib/auth/token";
import { getUserProfile, updateUserProfile } from "@/lib/profile/service";

vi.mock("@/lib/auth/session", () => ({
  applySessionCookie: vi.fn((response: Response) => response),
  getSession: vi.fn(),
}));

vi.mock("@/lib/auth/token", () => ({
  createSessionToken: vi.fn(() => Promise.resolve("next-session-token")),
}));

vi.mock("@/lib/profile/service", () => ({
  getUserProfile: vi.fn(),
  updateUserProfile: vi.fn(),
}));

vi.mock("@/lib/audit/service", () => ({
  recordAuditEventSafely: vi.fn(() => Promise.resolve()),
}));

const session = {
  id: "viewer-1",
  firstName: "View",
  lastName: "User",
  email: "viewer@example.com",
  department: null,
  role: "viewer" as const,
  sessionVersion: 3,
};

const profile = {
  firstName: "View",
  lastName: "User",
  email: "viewer@example.com",
  role: "viewer" as const,
  department: "Operations",
  username: "view.user",
  organization: "Sentrovia",
  jobTitle: "Observer",
  phone: "",
};

describe("personal profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(session);
    vi.mocked(getUserProfile).mockResolvedValue(profile);
    vi.mocked(updateUserProfile).mockResolvedValue(profile);
  });

  it("loads only the authenticated user's profile", async () => {
    const response = await GET();
    const body = (await response.json()) as { profile: typeof profile };

    expect(response.status).toBe(200);
    expect(body.profile).toEqual(profile);
    expect(getUserProfile).toHaveBeenCalledWith("viewer-1");
  });

  it("allows a viewer to update their own personal profile", async () => {
    const response = await PATCH(new Request("https://example.com/api/me/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...profile,
        role: undefined,
        email: " Viewer@Example.COM ",
        username: " View.User ",
      }),
    }) as never);

    expect(response.status).toBe(200);
    expect(updateUserProfile).toHaveBeenCalledWith("viewer-1", {
      firstName: "View",
      lastName: "User",
      email: "viewer@example.com",
      department: "Operations",
      username: "view.user",
      organization: "Sentrovia",
      jobTitle: "Observer",
      phone: "",
    });
    expect(recordAuditEventSafely).toHaveBeenCalledWith(expect.objectContaining({
      action: "profile.updated",
      actorUserId: "viewer-1",
    }));
    expect(createSessionToken).toHaveBeenCalledWith(expect.objectContaining({
      id: "viewer-1",
      email: "viewer@example.com",
      role: "viewer",
    }), 3);
    expect(applySessionCookie).toHaveBeenCalledWith(response, "next-session-token");
  });

  it("rejects invalid profile fields before persistence", async () => {
    const response = await PATCH(new Request("https://example.com/api/me/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...profile, email: "invalid" }),
    }) as never);

    expect(response.status).toBe(400);
    expect(updateUserProfile).not.toHaveBeenCalled();
  });
});
