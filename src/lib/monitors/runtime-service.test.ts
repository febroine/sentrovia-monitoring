import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Monitor } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  gt: vi.fn(),
  returning: vi.fn(),
  where: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  db: {} as { update: typeof vi.fn },
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, gt: mocks.gt };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import {
  hasPrivateTargetAccess,
  recordMonitorResult,
  renewMonitorLease,
} from "@/lib/monitors/runtime-service";
import { monitors } from "@/lib/db/schema";

describe("monitor lease persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gt.mockReturnValue("unexpired-lease-condition");
    mocks.returning.mockResolvedValue([{ id: "monitor-1" }]);
    mocks.where.mockReturnValue({ returning: mocks.returning });
    mocks.set.mockReturnValue({ where: mocks.where });
    mocks.update.mockReturnValue({ set: mocks.set });
    mocks.db.update = mocks.update;
  });

  it("rejects a result from an expired lease even when its token still matches", async () => {
    await recordMonitorResult(
      "monitor-1",
      buildResultUpdate(),
      "lease-1"
    );

    expect(mocks.gt).toHaveBeenCalledWith(monitors.leaseExpiresAt, expect.any(Date));
  });

  it("does not renew a lease that has already expired", async () => {
    await renewMonitorLease("monitor-1", "lease-1", {
      timeout: 5_000,
      verificationMode: false,
    } as Pick<Monitor, "timeout" | "verificationMode">);

    expect(mocks.gt).toHaveBeenCalledWith(monitors.leaseExpiresAt, expect.any(Date));
  });
});

describe("private target authorization", () => {
  it("uses the monitor workspace role instead of a role from another workspace", () => {
    const memberships = [
      { userId: "user-1", workspaceId: "workspace-admin", role: "admin" },
      { userId: "user-1", workspaceId: "workspace-operator", role: "operator" },
    ];

    expect(hasPrivateTargetAccess({ userId: "user-1", workspaceId: "workspace-admin" }, memberships)).toBe(true);
    expect(hasPrivateTargetAccess({ userId: "user-1", workspaceId: "workspace-operator" }, memberships)).toBe(false);
  });
});

function buildResultUpdate() {
  const now = new Date("2026-09-02T09:00:00.000Z");
  return {
    status: "up",
    statusCode: 200,
    lastCheckedAt: now,
    nextCheckAt: now,
    consecutiveFailures: 0,
    verificationMode: false,
    verificationFailureCount: 0,
  };
}
