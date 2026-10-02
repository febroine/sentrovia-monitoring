import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listMonitorAlertStates: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/monitors/alert-states", () => ({ listMonitorAlertStates: mocks.listMonitorAlertStates }));

import { GET } from "@/app/api/monitors/alert-states/route";

describe("monitor alert states route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "user-1", activeWorkspaceId: "workspace-1" });
    mocks.listMonitorAlertStates.mockResolvedValue([{ id: "m-1", name: "Shop", url: "https://shop.example.com", state: "down" }]);
  });

  it("requires a session", async () => {
    mocks.getSession.mockResolvedValue(null);

    expect((await GET()).status).toBe(401);
    expect(mocks.listMonitorAlertStates).not.toHaveBeenCalled();
  });

  it("lists the active workspace's monitors with the workspace id", async () => {
    const response = await GET();

    expect(mocks.listMonitorAlertStates).toHaveBeenCalledWith("workspace-1");
    await expect(response.json()).resolves.toEqual({
      workspaceId: "workspace-1",
      monitors: [{ id: "m-1", name: "Shop", url: "https://shop.example.com", state: "down" }],
    });
  });
});
