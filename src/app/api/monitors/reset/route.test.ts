import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMutationPermission: vi.fn(),
  resetMonitorHistory: vi.fn(),
}));

vi.mock("@/lib/http/api-route", () => ({
  apiErrorResponse: (error: unknown) => Response.json({ message: String(error) }, { status: 500 }),
  parseJsonRequest: async (request: Request) => request.json(),
  requireMutationPermission: mocks.requireMutationPermission,
}));
vi.mock("@/lib/monitors/service", () => ({ resetMonitorHistory: mocks.resetMonitorHistory }));
vi.mock("@/lib/monitors/utils", () => ({ serializeMonitorRecord: (monitor: unknown) => monitor }));

import { POST } from "@/app/api/monitors/reset/route";

describe("monitor history reset route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMutationPermission.mockResolvedValue({
      id: "user-1",
      activeWorkspaceId: "workspace-1",
    });
  });

  it("resets selected monitors in the active workspace", async () => {
    const ids = ["11111111-1111-4111-8111-111111111111"];
    mocks.resetMonitorHistory.mockResolvedValue([{ id: ids[0], status: "pending" }]);

    const response = await POST(buildRequest({ ids }));

    expect(response.status).toBe(200);
    expect(mocks.requireMutationPermission).toHaveBeenCalledWith(expect.any(Request), "monitors.manage");
    expect(mocks.resetMonitorHistory).toHaveBeenCalledWith("user-1", ids, "workspace-1");
    await expect(response.json()).resolves.toEqual({ monitors: [{ id: ids[0], status: "pending" }] });
  });

  it("returns not found when no selected monitor belongs to the workspace", async () => {
    mocks.resetMonitorHistory.mockResolvedValue([]);

    const response = await POST(buildRequest({ ids: ["11111111-1111-4111-8111-111111111111"] }));

    expect(response.status).toBe(404);
  });
});

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/monitors/reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}
