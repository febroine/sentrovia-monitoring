import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/system/health/route";
import { requireAdminSession } from "@/lib/auth/authorization";
import { AuthError } from "@/lib/auth/errors";
import { getSystemHealth } from "@/lib/system/health-service";

vi.mock("@/lib/auth/authorization", () => ({
  requireAdminSession: vi.fn(),
}));

vi.mock("@/lib/system/health-service", () => ({
  getSystemHealth: vi.fn(),
}));

describe("system health route", () => {
  it("denies unauthenticated users", async () => {
    vi.mocked(requireAdminSession).mockRejectedValueOnce(new AuthError("Unauthorized", 401));

    const response = await GET();

    expect(response.status).toBe(401);
    expect(getSystemHealth).not.toHaveBeenCalled();
  });

  it("denies non-admin users", async () => {
    vi.mocked(requireAdminSession).mockRejectedValueOnce(
      new AuthError("Admin access required.", 403)
    );

    const response = await GET();

    expect(response.status).toBe(403);
    expect(getSystemHealth).not.toHaveBeenCalled();
  });

  it("returns in-app health data for an admin", async () => {
    vi.mocked(requireAdminSession).mockResolvedValueOnce({
      id: "admin-1",
      firstName: "Admin",
      lastName: "User",
      email: "admin@example.com",
      department: null,
      role: "admin",
      sessionVersion: 1,
    });
    vi.mocked(getSystemHealth).mockResolvedValueOnce({
      generatedAt: "2026-07-16T09:00:00.000Z",
      overallStatus: "healthy",
      alarms: [],
      worker: {
        desiredState: "running",
        running: true,
        processAlive: true,
        heartbeatAt: "2026-07-16T09:00:00.000Z",
        heartbeatAgeMs: 0,
        lastCycleAt: "2026-07-16T09:00:00.000Z",
        lastCycleDurationMs: 20,
        lastCycleBacklog: 0,
        lastErrorAt: null,
        lastErrorMessage: null,
        connectivityStatus: "online",
        connectivityCheckedAt: "2026-07-16T09:00:00.000Z",
        connectivityMessage: "Internet connectivity confirmed.",
      },
      queue: { dueBacklog: 0, delayedMonitorCount: 0, delayedMonitors: [] },
      delivery: { failedLast24Hours: 0, queuedLast24Hours: 0, recentFailures: [] },
    });

    const response = await GET();
    const body = (await response.json()) as { health: { overallStatus: string } };

    expect(response.status).toBe(200);
    expect(body.health.overallStatus).toBe("healthy");
  });
});
