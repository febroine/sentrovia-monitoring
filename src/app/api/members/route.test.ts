import { describe, expect, it, vi } from "vitest";
import { DELETE } from "@/app/api/members/route";
import { PATCH } from "@/app/api/members/[id]/route";
import { getSession } from "@/lib/auth/session";
import { deleteMembers, updateMember } from "@/lib/members/service";

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
  clearSessionCookie: vi.fn((response: Response) => response),
}));

vi.mock("@/lib/members/service", () => ({
  deleteMembers: vi.fn(),
  listMembers: vi.fn(),
  updateMember: vi.fn(),
}));

vi.mock("@/lib/auth/service", () => ({
  createMember: vi.fn(),
}));

describe("members route", () => {
  it("lets admins request deletion of other members", async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@example.com",
      role: "admin",
      sessionVersion: 1,
    });
    vi.mocked(deleteMembers).mockResolvedValueOnce([{ id: "member-2" }]);

    const response = await DELETE(
      new Request("https://example.com/api/members", {
        method: "DELETE",
        body: JSON.stringify({ ids: ["member-2"] }),
      }) as never
    );
    const body = (await response.json()) as { ids: string[]; signedOut: boolean };

    expect(response.status).toBe(200);
    expect(body).toEqual({ ids: ["member-2"], signedOut: false });
    expect(deleteMembers).toHaveBeenCalledWith("admin-1", "admin", ["member-2"]);
  });

  it("rejects invalid usernames during member updates", async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@example.com",
      role: "admin",
      sessionVersion: 1,
    });

    const response = await PATCH(
      new Request("https://example.com/api/members/member-2", {
        method: "PATCH",
        body: JSON.stringify({ email: "member@example.com", username: "bad name!" }),
      }) as never,
      { params: Promise.resolve({ id: "member-2" }) }
    );
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(400);
    expect(body.message).toBe("Username can only include letters, numbers, dots, underscores, and dashes.");
    expect(updateMember).not.toHaveBeenCalled();
  });

  it("normalizes member update email and username before saving", async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@example.com",
      role: "admin",
      sessionVersion: 1,
    });
    vi.mocked(updateMember).mockResolvedValueOnce({
      id: "member-2",
      firstName: "Member",
      lastName: "Two",
      email: "member@example.com",
      department: null,
      role: "member",
      username: "member.two",
      organization: null,
      jobTitle: null,
      createdAt: new Date("2026-07-08T09:00:00.000Z"),
    });

    const response = await PATCH(
      new Request("https://example.com/api/members/member-2", {
        method: "PATCH",
        body: JSON.stringify({ email: "Member@Example.COM", username: "Member.Two" }),
      }) as never,
      { params: Promise.resolve({ id: "member-2" }) }
    );

    expect(response.status).toBe(200);
    expect(updateMember).toHaveBeenCalledWith("member-2", "admin-1", {
      email: "member@example.com",
      username: "member.two",
    });
  });
});
