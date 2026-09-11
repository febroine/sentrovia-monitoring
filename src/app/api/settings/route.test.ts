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
import { DEFAULT_SETTINGS } from "@/lib/settings/types";

vi.mock("@/lib/audit/service", () => ({ recordAuditEventSafely: vi.fn() }));

describe("settings route permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSettings.mockResolvedValue(DEFAULT_SETTINGS);
  });

  it("loads settings without sensitive configuration for read-only users", async () => {
    mocks.getSession.mockResolvedValue({
      id: "user-1",
      role: "viewer",
      activeWorkspaceId: "workspace-1",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.getSettings).toHaveBeenCalledWith("user-1", false, "workspace-1");
  });

  it("rejects settings updates from read-only users", async () => {
    mocks.getSession.mockResolvedValue({
      id: "user-1",
      role: "viewer",
      activeWorkspaceId: "workspace-1",
    });

    const response = await PATCH(
      new Request("http://localhost/api/settings", { method: "PATCH" }) as never
    );

    expect(response.status).toBe(403);
    expect(mocks.upsertSettings).not.toHaveBeenCalled();
  });

  it.each(["operator", "manager"])("rejects backup policy changes by %s", async (role) => {
    mocks.getSession.mockResolvedValue({ id: "user-1", role, activeWorkspaceId: "workspace-1" });
    for (const changes of [
      { autoBackupEnabled: true }, { backupWindow: "12:00" }, { backupRetentionCount: 2 },
    ]) {
      const response = await PATCH(settingsRequest({ ...DEFAULT_SETTINGS.data, ...changes }));
      expect(response.status).toBe(403);
    }
    expect(mocks.upsertSettings).not.toHaveBeenCalled();
  });

  it("allows operators to save ordinary settings without changing backup policy", async () => {
    mocks.getSession.mockResolvedValue({ id: "user-1", role: "operator", activeWorkspaceId: "workspace-1" });
    const response = await PATCH(settingsRequest(DEFAULT_SETTINGS.data));
    expect(response.status).toBe(200);
    expect(mocks.upsertSettings).toHaveBeenCalledWith("user-1", expect.any(Object), undefined, false, "workspace-1", false);
  });

  it("allows administrators to change backup policy", async () => {
    mocks.getSession.mockResolvedValue({ id: "user-1", role: "admin", activeWorkspaceId: "workspace-1" });
    const response = await PATCH(settingsRequest({ ...DEFAULT_SETTINGS.data, autoBackupEnabled: true }));
    expect(response.status).toBe(200);
    expect(mocks.upsertSettings).toHaveBeenCalledWith("user-1", expect.any(Object), undefined, false, "workspace-1", true);
  });

  it("fails closed when current settings cannot be loaded for a non-admin", async () => {
    mocks.getSession.mockResolvedValue({ id: "user-1", role: "operator", activeWorkspaceId: "workspace-1" });
    mocks.getSettings.mockResolvedValue(null);
    const response = await PATCH(settingsRequest(DEFAULT_SETTINGS.data));
    expect(response.status).toBe(409);
    expect(mocks.upsertSettings).not.toHaveBeenCalled();
  });
});

function settingsRequest(data: typeof DEFAULT_SETTINGS.data) {
  return new Request("http://localhost/api/settings", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...DEFAULT_SETTINGS,
      profile: { ...DEFAULT_SETTINGS.profile, firstName: "Test", lastName: "User", email: "test@example.com" },
      data,
    }),
  }) as never;
}
