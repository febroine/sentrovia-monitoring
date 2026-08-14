import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  saveDashboardPreferences: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/dashboard/service", () => ({ saveDashboardPreferences: mocks.saveDashboardPreferences }));

import { PATCH } from "@/app/api/dashboard/preferences/route";

describe("dashboard preferences route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "user-1" });
    mocks.saveDashboardPreferences.mockResolvedValue({ preferences: { focus: "all" } });
  });

  it("requires an authenticated session", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const response = await PATCH(new Request("http://localhost/api/dashboard/preferences", { method: "PATCH" }) as never);

    expect(response.status).toBe(401);
  });

  it("validates and persists the dashboard layout", async () => {
    const payload = { widgets: ["summary", "monitor-focus"], companyId: "", focus: "favorites" };
    const response = await PATCH(new Request("http://localhost/api/dashboard/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }) as never);

    expect(response.status).toBe(200);
    expect(mocks.saveDashboardPreferences).toHaveBeenCalledWith("user-1", payload);
  });

  it("rejects unsupported widget identifiers", async () => {
    const response = await PATCH(new Request("http://localhost/api/dashboard/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ widgets: ["unknown"], companyId: "", focus: "all" }),
    }) as never);

    expect(response.status).toBe(400);
    expect(mocks.saveDashboardPreferences).not.toHaveBeenCalled();
  });
});
