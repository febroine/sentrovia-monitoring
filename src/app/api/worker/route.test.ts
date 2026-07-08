import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/worker/route";
import { getSession } from "@/lib/auth/session";
import { getWorkerState, updateWorkerState } from "@/lib/monitors/service";
import { getWorkerObservability } from "@/lib/worker/observability";
import { spawnWorkerProcess } from "@/lib/worker/process";

const memberSession = {
  id: "member-1",
  firstName: "Member",
  lastName: "User",
  email: "member@example.com",
  department: null,
  role: "member" as const,
  sessionVersion: 1,
};

const adminSession = {
  ...memberSession,
  id: "admin-1",
  email: "admin@example.com",
  role: "admin" as const,
};

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    disableEmbeddedWorkerSpawn: true,
    workerPollIntervalMs: 30_000,
  },
}));

vi.mock("@/lib/monitors/service", () => ({
  getWorkerState: vi.fn(),
  updateWorkerState: vi.fn(),
}));

vi.mock("@/lib/worker/observability", () => ({
  getWorkerObservability: vi.fn(),
}));

vi.mock("@/lib/worker/process", () => ({
  isPidAlive: vi.fn(() => false),
  spawnWorkerProcess: vi.fn(),
}));

describe("worker route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWorkerState).mockResolvedValue(buildWorkerState());
    vi.mocked(updateWorkerState).mockResolvedValue(buildWorkerState());
    vi.mocked(getWorkerObservability).mockResolvedValue(null as never);
  });

  it("denies worker telemetry to non-admin members", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(memberSession);

    const response = await GET(new NextRequest("https://example.com/api/worker?range=7d"));
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(403);
    expect(body.message).toBe("Admin access required.");
    expect(getWorkerState).not.toHaveBeenCalled();
    expect(getWorkerObservability).not.toHaveBeenCalled();
  });

  it("denies worker lifecycle actions to non-admin members", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(memberSession);

    const response = await POST(
      new NextRequest("https://example.com/api/worker", {
        method: "POST",
        body: JSON.stringify({ action: "stop" }),
      })
    );
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(403);
    expect(body.message).toBe("Admin access required.");
    expect(updateWorkerState).not.toHaveBeenCalled();
    expect(spawnWorkerProcess).not.toHaveBeenCalled();
  });

  it("allows admins to read worker telemetry", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(adminSession);

    const response = await GET(new NextRequest("https://example.com/api/worker?range=24h"));

    expect(response.status).toBe(200);
    expect(getWorkerState).toHaveBeenCalledTimes(1);
    expect(getWorkerObservability).toHaveBeenCalledWith("admin-1", expect.any(Object), "24h");
  });
});

function buildWorkerState() {
  return {
    desiredState: "running",
    running: true,
    checkedCount: 12,
    lastCycleAt: new Date("2026-07-08T09:00:00.000Z"),
    lastCycleDurationMs: 120,
    lastCycleMonitorCount: 2,
    lastCycleSuccessCount: 2,
    lastCycleFailureCount: 0,
    lastCyclePendingCount: 0,
    lastCycleAverageLatencyMs: 50,
    lastCycleBacklog: 0,
    lastErrorAt: null,
    lastErrorMessage: null,
    heartbeatAt: new Date(),
    startedAt: new Date("2026-07-08T08:00:00.000Z"),
    stoppedAt: null,
    pid: null,
    statusMessage: "Worker is running.",
  };
}
