import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  bulkMoveMonitorsToCompany: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/monitors/service", () => ({ bulkMoveMonitorsToCompany: mocks.bulkMoveMonitorsToCompany }));

import { PATCH } from "@/app/api/monitors/bulk/company/route";

const monitorId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";

describe("bulk monitor company route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "user-1", activeWorkspaceId: "workspace-1", role: "operator" });
    mocks.bulkMoveMonitorsToCompany.mockResolvedValue([]);
  });

  it("rejects an invalid destination", async () => {
    const response = await PATCH(request({ ids: [monitorId], companyId: "unknown" }));
    expect(response.status).toBe(400);
    expect(mocks.bulkMoveMonitorsToCompany).not.toHaveBeenCalled();
  });

  it("moves selected monitors to the chosen company", async () => {
    const response = await PATCH(request({ ids: [monitorId], companyId }));
    expect(response.status).toBe(200);
    expect(mocks.bulkMoveMonitorsToCompany).toHaveBeenCalledWith("user-1", [monitorId], companyId, "workspace-1");
  });

  it("rejects duplicate monitor IDs as invalid input", async () => {
    const response = await PATCH(request({ ids: [monitorId, monitorId], companyId }));
    expect(response.status).toBe(400);
    expect(mocks.bulkMoveMonitorsToCompany).not.toHaveBeenCalled();
  });
});

function request(body: unknown) {
  return new Request("http://localhost/api/monitors/bulk/company", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}
