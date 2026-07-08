import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/updates/route";
import { AuthError } from "@/lib/auth/errors";
import { requireAdminSession } from "@/lib/auth/authorization";
import { getUpdateStatus } from "@/lib/updates/service";

vi.mock("@/lib/auth/authorization", () => ({
  requireAdminSession: vi.fn(),
}));

vi.mock("@/lib/updates/service", () => ({
  getUpdateStatus: vi.fn(),
}));

describe("updates route", () => {
  it("denies unauthenticated users", async () => {
    vi.mocked(requireAdminSession).mockRejectedValueOnce(new AuthError("Unauthorized", 401));

    const response = await GET();
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(401);
    expect(body.message).toBe("Unauthorized");
    expect(getUpdateStatus).not.toHaveBeenCalled();
  });

  it("denies non-admin members", async () => {
    vi.mocked(requireAdminSession).mockRejectedValueOnce(new AuthError("Admin access required.", 403));

    const response = await GET();
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(403);
    expect(body.message).toBe("Admin access required.");
    expect(getUpdateStatus).not.toHaveBeenCalled();
  });

  it("returns guided update status for admins", async () => {
    vi.mocked(requireAdminSession).mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@example.com",
      role: "admin",
      sessionVersion: 1,
    });
    vi.mocked(getUpdateStatus).mockResolvedValueOnce({
      currentVersion: "0.1.1",
      repository: "aykutbyrm/sentrovia-monitoring",
      latestVersion: "0.1.2",
      updateAvailable: true,
      releaseUrl: "https://github.com/aykutbyrm/sentrovia-monitoring/releases/tag/v0.1.2",
      releaseName: "Sentrovia v0.1.2",
      publishedAt: "2026-07-08T09:00:00.000Z",
      notes: "Release notes",
      checkedAt: "2026-07-08T09:30:00.000Z",
      status: "ok",
      message: "Latest GitHub release checked.",
      recommendedCommands: ["git fetch --tags origin", "git checkout v0.1.2", "docker compose up -d --build"],
      dockerCommands: ["git fetch --tags origin", "git checkout v0.1.2", "docker compose up -d --build"],
      serviceCommands: ["nssm stop sentrovia-worker", "git checkout v0.1.2", "npm ci"],
      backupReminder: "Create a backup first.",
      requiresManualAction: true,
    });

    const response = await GET();
    const body = (await response.json()) as { update: Awaited<ReturnType<typeof getUpdateStatus>> };

    expect(response.status).toBe(200);
    expect(body.update.updateAvailable).toBe(true);
    expect(body.update.dockerCommands).toContain("docker compose up -d --build");
    expect(body.update.requiresManualAction).toBe(true);
  });
});
