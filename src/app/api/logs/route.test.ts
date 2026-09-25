import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listLogs: vi.fn(),
  getLogFilterOptions: vi.fn(),
  countClearableLogs: vi.fn(),
  clearLogs: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/lib/logs/service", () => ({
  listLogs: mocks.listLogs,
  getLogFilterOptions: mocks.getLogFilterOptions,
  countClearableLogs: mocks.countClearableLogs,
  clearLogs: mocks.clearLogs,
}));

import { GET } from "@/app/api/logs/route";

describe("event-log authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listLogs.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 10 });
    mocks.getLogFilterOptions.mockResolvedValue({ companies: [], monitors: [] });
    mocks.countClearableLogs.mockResolvedValue(2);
  });

  it.each(["viewer", "operator"] as const)("denies %s access without audit.read", async (role) => {
    mocks.getSession.mockResolvedValue({
      id: `${role}-1`,
      activeWorkspaceId: "workspace-1",
      role,
    });

    const response = await GET(new NextRequest("http://localhost/api/logs"));

    expect(response.status).toBe(403);
    expect(mocks.listLogs).not.toHaveBeenCalled();
    expect(mocks.getLogFilterOptions).not.toHaveBeenCalled();
    expect(mocks.countClearableLogs).not.toHaveBeenCalled();
  });

  it.each(["manager", "admin"] as const)("allows %s access with audit.read", async (role) => {
    mocks.getSession.mockResolvedValue({
      id: `${role}-1`,
      activeWorkspaceId: "workspace-1",
      role,
    });

    const response = await GET(new NextRequest("http://localhost/api/logs"));

    expect(response.status).toBe(200);
    expect(mocks.listLogs).toHaveBeenCalledWith(
      `${role}-1`,
      expect.any(Object),
      "workspace-1"
    );
    expect((await response.json()).pagination.clearableTotal).toBe(2);
  });
});
