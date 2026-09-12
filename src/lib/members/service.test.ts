import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: mocks.transaction,
  },
}));

import {
  assertAdminDemotionLeavesAdministrator,
  assertAdminDeletionLeavesAdministrator,
  deleteMembers,
  filterSelfMemberIds,
} from "@/lib/members/service";
import { workspaceMembers } from "@/lib/db/schema";

describe("member service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps member deletion limited to the current user", () => {
    expect(filterSelfMemberIds("user-1", ["user-2", "user-1", "user-1"])).toEqual(["user-1"]);
  });

  it("returns no member ids when the current user is not selected", () => {
    expect(filterSelfMemberIds("user-1", ["user-2", "user-3"])).toEqual([]);
  });

  it("allows admin deletion when another admin remains", () => {
    expect(() => assertAdminDeletionLeavesAdministrator(2, 1)).not.toThrow();
  });

  it("rejects deletion of the final admin", () => {
    expect(() => assertAdminDeletionLeavesAdministrator(1, 1)).toThrow(
      "At least one admin account must remain."
    );
  });

  it("allows an admin demotion when another admin remains", () => {
    expect(() => assertAdminDemotionLeavesAdministrator(2)).not.toThrow();
  });

  it("rejects demotion of the final admin", () => {
    expect(() => assertAdminDemotionLeavesAdministrator(1)).toThrow(
      "At least one admin account must remain."
    );
  });

  it("revokes workspace membership without deleting the user or their shared resources", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ id: "member-2", role: "operator" }])),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ total: 1 }])),
        })),
      });
    const returning = vi.fn(() => Promise.resolve([{ id: "member-2" }]));
    const where = vi.fn(() => ({ returning }));
    const deleteFrom = vi.fn(() => ({ where }));
    const transactionExecutor = {
      execute: vi.fn(() => Promise.resolve()),
      select,
      delete: deleteFrom,
    };
    mocks.transaction.mockImplementationOnce(async (callback) => callback(transactionExecutor));

    await expect(
      deleteMembers("workspace-1", "admin-1", "admin", ["member-2"])
    ).resolves.toEqual([{ id: "member-2" }]);

    expect(deleteFrom).toHaveBeenCalledOnce();
    expect(deleteFrom).toHaveBeenCalledWith(workspaceMembers);
    expect(returning).toHaveBeenCalledTimes(1);
  });
});
