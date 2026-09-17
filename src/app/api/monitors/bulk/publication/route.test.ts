import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  bulkUpdateMonitorPublication: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/monitors/service", () => ({ bulkUpdateMonitorPublication: mocks.bulkUpdateMonitorPublication }));

import { PATCH } from "@/app/api/monitors/bulk/publication/route";

const monitorId = "11111111-1111-4111-8111-111111111111";

describe("bulk monitor publication route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "user-1", activeWorkspaceId: "workspace-1", role: "operator" });
    mocks.bulkUpdateMonitorPublication.mockResolvedValue([]);
  });

  it("updates selected monitors in the active workspace", async () => {
    const response = await PATCH(request({ ids: [monitorId], publishOnStatusPage: true }));
    expect(response.status).toBe(200);
    expect(mocks.bulkUpdateMonitorPublication).toHaveBeenCalledWith([monitorId], true, "workspace-1");
  });

  it("rejects duplicate monitor IDs", async () => {
    const response = await PATCH(request({ ids: [monitorId, monitorId], publishOnStatusPage: false }));
    expect(response.status).toBe(400);
    expect(mocks.bulkUpdateMonitorPublication).not.toHaveBeenCalled();
  });

  it("blocks read-only users", async () => {
    mocks.getSession.mockResolvedValueOnce({ id: "user-1", activeWorkspaceId: "workspace-1", role: "viewer" });
    const response = await PATCH(request({ ids: [monitorId], publishOnStatusPage: true }));
    expect(response.status).toBe(403);
    expect(mocks.bulkUpdateMonitorPublication).not.toHaveBeenCalled();
  });
});

function request(body: unknown) {
  return new Request("http://localhost/api/monitors/bulk/publication", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}
