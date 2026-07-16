import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getDeliveryOverview: vi.fn(),
  deleteDeliveryHistory: vi.fn(),
  upsertWebhookSettings: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/delivery/service", () => ({
  getDeliveryOverview: mocks.getDeliveryOverview,
  deleteDeliveryHistory: mocks.deleteDeliveryHistory,
  upsertWebhookSettings: mocks.upsertWebhookSettings,
}));

import { DELETE, GET } from "@/app/api/delivery/route";

const overview = {
  webhook: null,
  history: [],
  summary: { delivered: 0, failed: 0, retrying: 0, pendingWebhookRetries: 0 },
  pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
};

describe("delivery route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "user-1", role: "admin" });
    mocks.getDeliveryOverview.mockResolvedValue(overview);
    mocks.deleteDeliveryHistory.mockResolvedValue(1);
  });

  it("passes the requested history page to the service", async () => {
    const response = await GET(new Request("http://localhost/api/delivery?page=3") as never);

    expect(response.status).toBe(200);
    expect(mocks.getDeliveryOverview).toHaveBeenCalledWith("user-1", 3);
  });

  it("rejects an invalid history page", async () => {
    const response = await GET(new Request("http://localhost/api/delivery?page=0") as never);

    expect(response.status).toBe(400);
    expect(mocks.getDeliveryOverview).not.toHaveBeenCalled();
  });

  it("deletes the authenticated user's completed history in the full custom date range", async () => {
    const request = new Request("http://localhost/api/delivery", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ range: "custom", from: "2026-07-01", to: "2026-07-03" }),
    });

    const response = await DELETE(request as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.count).toBe(1);
    expect(mocks.deleteDeliveryHistory).toHaveBeenCalledWith("user-1", {
      from: new Date("2026-07-01T00:00:00.000Z"),
      toExclusive: new Date("2026-07-04T00:00:00.000Z"),
    });
    expect(mocks.getDeliveryOverview).toHaveBeenCalledWith("user-1", 1);
  });

  it("rejects reversed custom date ranges", async () => {
    const request = new Request("http://localhost/api/delivery", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ range: "custom", from: "2026-07-04", to: "2026-07-03" }),
    });

    const response = await DELETE(request as never);

    expect(response.status).toBe(400);
    expect(mocks.deleteDeliveryHistory).not.toHaveBeenCalled();
  });
});
