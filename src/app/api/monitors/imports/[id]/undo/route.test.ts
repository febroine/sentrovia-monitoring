import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), undoLatestMonitorImport: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/monitors/import-history", () => ({ undoLatestMonitorImport: mocks.undoLatestMonitorImport }));

import { POST } from "@/app/api/monitors/imports/[id]/undo/route";

describe("monitor import undo route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "user-1", activeWorkspaceId: "workspace-1", role: "operator" });
    mocks.undoLatestMonitorImport.mockResolvedValue({ removedCount: 2, run: { id: "run-1", status: "undone" } });
  });

  it("undoes the selected run inside the active workspace", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/monitors/imports/run-1/undo", { method: "POST" }),
      { params: Promise.resolve({ id: "run-1" }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.undoLatestMonitorImport).toHaveBeenCalledWith("user-1", "workspace-1", "run-1");
  });

  it("rejects unauthenticated undo attempts", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(
      new NextRequest("http://localhost/api/monitors/imports/run-1/undo", { method: "POST" }),
      { params: Promise.resolve({ id: "run-1" }) }
    );
    expect(response.status).toBe(401);
  });
});
