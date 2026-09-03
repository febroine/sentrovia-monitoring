import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listMonitors: vi.fn(),
  listMonitorsPage: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/monitors/service", () => ({
  createMonitor: vi.fn(),
  deleteMonitors: vi.fn(),
  listMonitors: mocks.listMonitors,
  listMonitorsPage: mocks.listMonitorsPage,
  SOFT_DELETE_UNDO_MS: 60_000,
}));

import { GET } from "@/app/api/monitors/route";

describe("monitor list route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      id: "user-1",
      role: "operator",
      activeWorkspaceId: "workspace-1",
    });
    mocks.listMonitorsPage.mockResolvedValue({
      monitors: [],
      pagination: { page: 2, pageSize: 10, totalItems: 14, totalPages: 2 },
      summary: { total: 14, active: 12, paused: 2, online: 10, offline: 1, pending: 1 },
    });
  });

  it("passes validated server-side filters with the trusted workspace", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/monitors?page=2&pageSize=10&search=api&companyId=company-1&status=down&sort=name&direction=asc"
    ));

    expect(response.status).toBe(200);
    expect(mocks.listMonitorsPage).toHaveBeenCalledWith(
      "user-1",
      {
        page: 2,
        pageSize: 10,
        search: "api",
        companyId: "company-1",
        status: "down",
        sort: "name",
        direction: "asc",
      },
      undefined,
      "workspace-1"
    );
    await expect(response.json()).resolves.toMatchObject({
      summary: { total: 14, active: 12, paused: 2, online: 10, offline: 1, pending: 1 },
    });
  });

  it("rejects unsupported page sizes before querying", async () => {
    const response = await GET(new NextRequest("http://localhost/api/monitors?page=1&pageSize=500"));

    expect(response.status).toBe(400);
    expect(mocks.listMonitorsPage).not.toHaveBeenCalled();
  });
});
