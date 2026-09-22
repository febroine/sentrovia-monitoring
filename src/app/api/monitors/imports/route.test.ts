import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), listMonitorImportRuns: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/monitors/import-history", () => ({ listMonitorImportRuns: mocks.listMonitorImportRuns }));

import { GET } from "@/app/api/monitors/imports/route";

describe("monitor import history route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "user-1", activeWorkspaceId: "workspace-1", role: "operator" });
    mocks.listMonitorImportRuns.mockResolvedValue([{ id: "run-1" }]);
  });

  it("lists history only for the active workspace", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(mocks.listMonitorImportRuns).toHaveBeenCalledWith("workspace-1");
  });

  it("rejects viewers without monitor management permission", async () => {
    mocks.getSession.mockResolvedValue({ id: "user-1", activeWorkspaceId: "workspace-1", role: "viewer" });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mocks.listMonitorImportRuns).not.toHaveBeenCalled();
  });
});
