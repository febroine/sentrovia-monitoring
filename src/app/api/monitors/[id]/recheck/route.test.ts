import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), queueMonitorRecheck: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/monitors/service", () => ({ queueMonitorRecheck: mocks.queueMonitorRecheck }));

import { POST } from "@/app/api/monitors/[id]/recheck/route";

const id = "11111111-1111-4111-8111-111111111111";
const request = new Request(`http://localhost/api/monitors/${id}/recheck`, { method: "POST" });
const context = { params: Promise.resolve({ id }) };

describe("queue monitor recheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "user-1", role: "admin", activeWorkspaceId: "workspace-1" });
    mocks.queueMonitorRecheck.mockResolvedValue(true);
  });

  it("queues an owned monitor in the active workspace", async () => {
    const response = await POST(request, context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ queued: true });
    expect(mocks.queueMonitorRecheck).toHaveBeenCalledWith("user-1", id, "workspace-1");
  });

  it("rejects a missing session or invalid monitor id", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request, context)).status).toBe(401);
    expect((await POST(request, { params: Promise.resolve({ id: "bad" }) })).status).toBe(400);
    expect(mocks.queueMonitorRecheck).not.toHaveBeenCalled();
  });

  it("does not allow a viewer to queue checks", async () => {
    mocks.getSession.mockResolvedValueOnce({ id: "viewer-1", role: "viewer", activeWorkspaceId: "workspace-1" });
    expect((await POST(request, context)).status).toBe(403);
    expect(mocks.queueMonitorRecheck).not.toHaveBeenCalled();
  });

  it("rejects a same-site request from another origin", async () => {
    const otherOrigin = new Request(request.url, {
      method: "POST",
      headers: { origin: "http://other.localhost", "sec-fetch-site": "same-site" },
    });
    expect((await POST(otherOrigin, context)).status).toBe(403);
    expect(mocks.queueMonitorRecheck).not.toHaveBeenCalled();
  });

  it("does not claim an unavailable or already queued monitor was checked", async () => {
    mocks.queueMonitorRecheck.mockResolvedValue(false);
    expect((await POST(request, context)).status).toBe(409);
  });
});
