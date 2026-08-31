import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateMonitorFlags: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/monitors/service", () => ({ updateMonitorFlags: mocks.updateMonitorFlags }));

import { PATCH } from "@/app/api/monitors/[id]/flags/route";

describe("monitor dashboard flags route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "user-1", activeWorkspaceId: "workspace-1" });
    mocks.updateMonitorFlags.mockResolvedValue({ id: "monitor-1", isFavorite: true, isCritical: false });
  });

  it("updates only the requested monitor flag", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/monitors/monitor-1/flags", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isFavorite: true }),
      }) as never,
      { params: Promise.resolve({ id: "monitor-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.updateMonitorFlags).toHaveBeenCalledWith(
      "user-1",
      "monitor-1",
      { isFavorite: true },
      "workspace-1"
    );
  });

  it("rejects an empty flag payload", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/monitors/monitor-1/flags", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }) as never,
      { params: Promise.resolve({ id: "monitor-1" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.updateMonitorFlags).not.toHaveBeenCalled();
  });
});
