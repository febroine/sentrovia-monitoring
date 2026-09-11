import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createManyMonitors: vi.fn(),
  getSession: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/monitors/service", () => ({ createManyMonitors: mocks.createManyMonitors }));
vi.mock("@/lib/settings/service", () => ({ getSettings: mocks.getSettings }));

import { POST } from "@/app/api/monitors/import/route";

describe("monitor import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      id: "user-1",
      activeWorkspaceId: "workspace-1",
      role: "operator",
    });
    mocks.getSettings.mockResolvedValue(null);
  });

  it("reports the original CSV row number when blank rows were skipped", async () => {
    const response = await POST(buildRequest({
      monitors: [{ url: "example.com" }],
      lineNumbers: [4],
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      message: expect.stringContaining("Row 4:"),
    }));
    expect(mocks.createManyMonitors).not.toHaveBeenCalled();
  });
});

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/monitors/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}
