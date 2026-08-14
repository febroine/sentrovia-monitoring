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
    mocks.getSession.mockResolvedValue({ id: "user-1" });
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

  it("retries one failed event when an event id is supplied", async () => {
    const response = await POST(
      new Request("http://localhost/api/delivery/retry?eventId=delivery-1", { method: "POST" }) as never
    );

    expect(response.status).toBe(200);
    expect(mocks.retryDeliveryEvent).toHaveBeenCalledWith("user-1", "delivery-1");
    expect(mocks.retryDeliveryQueue).not.toHaveBeenCalled();
  });

  it("returns a conflict when the event cannot be claimed", async () => {
    mocks.retryDeliveryEvent.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/api/delivery/retry?eventId=delivery-1", { method: "POST" }) as never
    );

    expect(response.status).toBe(409);
  });
});
