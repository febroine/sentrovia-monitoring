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
  selectClaimableMonitors,
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

describe("claimable monitor selection", () => {
  const row = (id: string, verificationMode = false) => ({ id, verificationMode });

  it("takes monitors round-robin across workspaces up to the free slots", () => {
    const selected = selectClaimableMonitors([
      [row("a1"), row("a2"), row("a3"), row("a4")],
      [row("b1")],
      [row("c1"), row("c2")],
    ], { limit: 5 });

    expect(selected.map((item) => item.id)).toEqual(["a1", "b1", "c1", "a2", "c2"]);
  });

  it("leaves verification probes beyond their share due while regular checks still start", () => {
    const selected = selectClaimableMonitors([
      [row("a-verify-1", true), row("a-verify-2", true), row("a1")],
      [row("b-verify-1", true), row("b1")],
    ], { limit: 4, verificationLimit: 1 });

    expect(selected.map((item) => item.id)).toEqual(["a-verify-1", "b1", "a1"]);
  });

  it("selects everything when no capacity is given", () => {
    expect(selectClaimableMonitors([[row("a1"), row("a2", true)], [row("b1")]])).toHaveLength(3);
  });

  it("selects nothing when there is no free slot", () => {
    expect(selectClaimableMonitors([[row("a1")]], { limit: 0 })).toEqual([]);
  });
});
