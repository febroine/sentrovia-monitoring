import { describe, expect, it, vi } from "vitest";
import { DELETE } from "@/app/api/members/route";
import { getSession } from "@/lib/auth/session";
import { deleteMembers } from "@/lib/members/service";

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
  clearSessionCookie: vi.fn((response: Response) => response),
}));

vi.mock("@/lib/members/service", () => ({
  deleteMembers: vi.fn(),
  listMembers: vi.fn(),
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
});
