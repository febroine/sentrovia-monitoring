import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateMonitorPause: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/monitors/service", () => ({ updateMonitorPause: mocks.updateMonitorPause }));

import { PATCH } from "@/app/api/monitors/pause/route";

describe("monitor pause route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "user-1", activeWorkspaceId: "workspace-1", role: "operator" });
    mocks.updateMonitorPause.mockResolvedValue([]);
  });

  it("pauses multiple monitors for the requested duration", async () => {
    const before = Date.now();
    const response = await PATCH(buildRequest({
      ids: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      action: "pause",
      durationValue: 2,
      durationUnit: "hours",
    }));

    expect(response.status).toBe(200);
    const pausedUntil = mocks.updateMonitorPause.mock.calls[0]?.[2] as Date;
    expect(pausedUntil.getTime()).toBeGreaterThanOrEqual(before + 2 * 60 * 60_000);
    expect(mocks.updateMonitorPause).toHaveBeenCalledWith(
      "user-1",
      ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      pausedUntil,
      "workspace-1"
    );
  });

  it("resumes paused monitors immediately", async () => {
    const ids = ["11111111-1111-4111-8111-111111111111"];
    const response = await PATCH(buildRequest({ ids, action: "resume" }));

    expect(response.status).toBe(200);
    expect(mocks.updateMonitorPause).toHaveBeenCalledWith("user-1", ids, null, "workspace-1");
  });

  it("rejects pauses longer than 365 days", async () => {
    const response = await PATCH(buildRequest({
      ids: ["11111111-1111-4111-8111-111111111111"],
      action: "pause",
      durationValue: 366,
      durationUnit: "days",
    }));

    expect(response.status).toBe(400);
    expect(mocks.updateMonitorPause).not.toHaveBeenCalled();
  });
});

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/monitors/pause", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}
