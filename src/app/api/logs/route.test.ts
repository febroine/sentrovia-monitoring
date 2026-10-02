import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listLogs: vi.fn(),
  getLogFilterOptions: vi.fn(),
  countClearableLogs: vi.fn(),
  clearLogs: vi.fn(),
  recordAuditEventSafely: vi.fn(),
}));

vi.mock("@/lib/audit/service", () => ({
  recordAuditEventSafely: mocks.recordAuditEventSafely,
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

import { DELETE, GET } from "@/app/api/logs/route";

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

  describe("clearing logs", () => {
    const deleteRequest = () => new NextRequest("http://localhost/api/logs", {
      method: "DELETE",
      headers: { origin: "http://localhost", "sec-fetch-site": "same-origin" },
    });

    it.each(["viewer", "operator", "manager"] as const)("refuses %s, who may not erase the event history", async (role) => {
      mocks.getSession.mockResolvedValue({ id: `${role}-1`, email: `${role}@example.com`, activeWorkspaceId: "workspace-1", role });

      const response = await DELETE(deleteRequest());

      expect(response.status).toBe(403);
      expect(mocks.clearLogs).not.toHaveBeenCalled();
    });

    it("lets an admin clear the logs and records it in the audit log", async () => {
      mocks.getSession.mockResolvedValue({ id: "admin-1", email: "admin@example.com", activeWorkspaceId: "workspace-1", role: "admin" });
      mocks.clearLogs.mockResolvedValue([{ id: "a" }, { id: "b" }]);

      const response = await DELETE(deleteRequest());

      expect(response.status).toBe(200);
      expect(mocks.clearLogs).toHaveBeenCalledWith("admin-1", "workspace-1");
      expect(mocks.recordAuditEventSafely).toHaveBeenCalledWith(expect.objectContaining({
        action: "logs.cleared",
        actorUserId: "admin-1",
        summary: "Cleared 2 event log entries.",
      }));
    });

    it("tells the page whether the viewer may clear logs", async () => {
      mocks.getSession.mockResolvedValue({ id: "manager-1", activeWorkspaceId: "workspace-1", role: "manager" });
      await expect((await GET(new NextRequest("http://localhost/api/logs"))).json()).resolves.toMatchObject({ canClear: false });
      mocks.getSession.mockResolvedValue({ id: "admin-1", activeWorkspaceId: "workspace-1", role: "admin" });
      await expect((await GET(new NextRequest("http://localhost/api/logs"))).json()).resolves.toMatchObject({ canClear: true });
    });
  });
});
