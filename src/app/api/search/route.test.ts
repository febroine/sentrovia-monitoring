import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), searchWorkspace: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/search/service", () => ({ searchWorkspace: mocks.searchWorkspace }));

import { GET } from "@/app/api/search/route";

describe("global search route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "user-1", activeWorkspaceId: "workspace-1", role: "manager" });
    mocks.searchWorkspace.mockResolvedValue([{ id: "monitor-1", type: "monitor", title: "API", description: "https://api.example", href: "/monitoring" }]);
  });

  it("scopes search to the active workspace and role", async () => {
    const response = await GET(new NextRequest("http://localhost/api/search?q=api"));
    expect(response.status).toBe(200);
    expect(mocks.searchWorkspace).toHaveBeenCalledWith("workspace-1", "user-1", "manager", "api");
  });

  it("does not query for one-character input", async () => {
    const response = await GET(new NextRequest("http://localhost/api/search?q=a"));
    await expect(response.json()).resolves.toEqual({ results: [] });
    expect(mocks.searchWorkspace).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated access", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(new NextRequest("http://localhost/api/search?q=api"));
    expect(response.status).toBe(401);
  });
});
