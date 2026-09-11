import { afterEach, describe, expect, it, vi } from "vitest";
import { getDashboardData, getCachedDashboardData, saveDashboardPreferences } from "@/lib/dashboard/service";
import { getSettings } from "@/lib/settings/service";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";

vi.mock("@/lib/db", () => ({ db: { select: vi.fn(() => ({
  from: () => ({
    where: async () => [],
    innerJoin: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }),
  }),
})) } }));
vi.mock("@/lib/settings/service", () => ({
  getSettings: vi.fn(),
  updateDashboardPreferences: vi.fn(),
}));
vi.mock("@/lib/monitors/service", () => ({ getWorkerState: vi.fn(async () => ({})) }));
vi.mock("@/lib/delivery/service", () => ({ getDeliverySummary: vi.fn(async () => ({})) }));

describe("dashboard secret isolation", () => {
  afterEach(() => vi.clearAllMocks());

  it("omits webhook credentials from page, stream cache and preference responses", async () => {
    vi.mocked(getSettings).mockImplementation(async (_userId, includeSensitiveConfig) => ({
      ...DEFAULT_SETTINGS,
      profile: { ...DEFAULT_SETTINGS.profile, role: "viewer" },
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        discordWebhookUrl: includeSensitiveConfig ? "https://discord.test/api/webhooks/private-token" : "",
      },
    }));

    const direct = await getDashboardData("viewer-1", "workspace-1");
    const cached = await getCachedDashboardData("viewer-1", "workspace-1");
    const updated = await saveDashboardPreferences("viewer-1", direct.preferences, "workspace-1");

    for (const response of [direct, cached, updated]) {
      expect(JSON.stringify(response)).not.toContain("private-token");
      expect(response.settings?.profile.role).toBe("viewer");
      expect(response.preferences).toEqual(direct.preferences);
    }
  });
});
