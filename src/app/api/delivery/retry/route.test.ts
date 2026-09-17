import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getDeliveryOverview: vi.fn(),
  retryDeliveryEvent: vi.fn(),
  retryDeliveryQueue: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/delivery/service", () => ({
  getDeliveryOverview: mocks.getDeliveryOverview,
  retryDeliveryEvent: mocks.retryDeliveryEvent,
  retryDeliveryQueue: mocks.retryDeliveryQueue,
}));

import { POST } from "@/app/api/delivery/retry/route";

describe("delivery retry route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      id: "user-1",
      role: "admin",
      activeWorkspaceId: "workspace-1",
    });
    mocks.getDeliveryOverview.mockResolvedValue({ history: [] });
    mocks.retryDeliveryEvent.mockResolvedValue({ id: "delivery-1", status: "delivered" });
    mocks.retryDeliveryQueue.mockResolvedValue({ processed: 2 });
  });

  it("requires an authenticated session", async () => {
    mocks.getSession.mockResolvedValueOnce(null);

    const response = await POST(new Request("http://localhost/api/delivery/retry", { method: "POST" }) as never);

    expect(response.status).toBe(401);
    expect(mocks.retryDeliveryQueue).not.toHaveBeenCalled();
  });

  it("rejects retries from read-only users", async () => {
    mocks.getSession.mockResolvedValueOnce({ id: "user-1", role: "viewer" });

    const response = await POST(
      new Request("http://localhost/api/delivery/retry", { method: "POST" }) as never
    );

    expect(response.status).toBe(403);
    expect(mocks.retryDeliveryQueue).not.toHaveBeenCalled();
  });

  it("retries one failed event when an event id is supplied", async () => {
    const response = await POST(
      new Request("http://localhost/api/delivery/retry?eventId=delivery-1", { method: "POST" }) as never
    );

    expect(response.status).toBe(200);
    expect(mocks.retryDeliveryEvent).toHaveBeenCalledWith(
      "user-1",
      "delivery-1",
      "workspace-1"
    );
    expect(mocks.retryDeliveryQueue).not.toHaveBeenCalled();
  });

  it("returns a conflict when the event cannot be claimed", async () => {
    mocks.retryDeliveryEvent.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/api/delivery/retry?eventId=delivery-1", { method: "POST" }) as never
    );

    expect(response.status).toBe(409);
  });

  it("retries only selected failed events and reports unavailable records", async () => {
    mocks.retryDeliveryEvent.mockResolvedValueOnce({ id: "delivery-1" }).mockResolvedValueOnce(null);
    const response = await POST(new Request("http://localhost/api/delivery/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["delivery-1", "delivery-2"] }),
    }) as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: { processed: 1, unavailable: 1, failed: 0 } });
    expect(mocks.retryDeliveryEvent).toHaveBeenCalledTimes(2);
    expect(mocks.retryDeliveryQueue).not.toHaveBeenCalled();
  });

  it("rejects duplicate selected delivery IDs", async () => {
    const response = await POST(new Request("http://localhost/api/delivery/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["delivery-1", "delivery-1"] }),
    }) as never);

    expect(response.status).toBe(400);
    expect(mocks.retryDeliveryEvent).not.toHaveBeenCalled();
  });

  it("continues remaining selected retries after one delivery errors", async () => {
    mocks.retryDeliveryEvent.mockRejectedValueOnce(new Error("Transport error"));
    const response = await POST(new Request("http://localhost/api/delivery/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["delivery-1", "delivery-2"] }),
    }) as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: { processed: 1, unavailable: 0, failed: 1 } });
    expect(mocks.retryDeliveryEvent).toHaveBeenCalledTimes(2);
  });
});
