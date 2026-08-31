import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSettings: vi.fn(),
  upsertSettings: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/settings/service", () => ({
  getSettings: mocks.getSettings,
  upsertSettings: mocks.upsertSettings,
}));

import { GET, PATCH } from "@/app/api/settings/route";

describe("settings route permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSettings.mockResolvedValue({ notifications: { discordWebhookUrl: "" } });
  });

  it("loads settings without sensitive configuration for read-only users", async () => {
    mocks.getSession.mockResolvedValue({ id: "user-1", role: "viewer" });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.getSettings).toHaveBeenCalledWith("user-1", false);
  });

  it("rejects settings updates from read-only users", async () => {
    mocks.getSession.mockResolvedValue({ id: "user-1", role: "viewer" });

    const response = await PATCH(
      new Request("http://localhost/api/settings", { method: "PATCH" }) as never
    );

    expect(response.status).toBe(403);
    expect(mocks.upsertSettings).not.toHaveBeenCalled();
  });
});
