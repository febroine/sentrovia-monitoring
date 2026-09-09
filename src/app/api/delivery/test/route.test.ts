import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  sendDeliveryTest: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/delivery/service", () => ({ sendDeliveryTest: mocks.sendDeliveryTest }));

import { POST } from "@/app/api/delivery/test/route";

describe("delivery test route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      id: "user-1",
      role: "admin",
      activeWorkspaceId: "workspace-1",
    });
    mocks.sendDeliveryTest.mockResolvedValue({ id: "delivery-1", status: "delivered" });
  });

  it.each(["telegram", "discord"] as const)("sends a %s delivery test", async (channel) => {
    const payload = {
      channel,
      destination: "",
      botToken: channel === "telegram" ? "123456:token" : "",
      chatId: channel === "telegram" ? "-1001234567890" : "",
      message: "Sentrovia delivery test",
    };
    const response = await POST(new Request("http://localhost/api/delivery/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }) as never);

    expect(response.status).toBe(200);
    expect(mocks.sendDeliveryTest).toHaveBeenCalledWith(
      "user-1",
      payload,
      "workspace-1"
    );
  });

  it("returns the recorded failed delivery when a test transport fails", async () => {
    mocks.sendDeliveryTest.mockResolvedValueOnce({
      id: "delivery-1",
      status: "failed",
      errorMessage: "Discord webhook is not configured or inactive.",
    });

    const response = await POST(new Request("http://localhost/api/delivery/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "discord", message: "Test" }),
    }) as never);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.delivery).toMatchObject({ id: "delivery-1", status: "failed" });
  });
});
