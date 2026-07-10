import { describe, expect, it } from "vitest";
import {
  assertAdminDeletionLeavesAdministrator,
  filterSelfMemberIds,
} from "@/lib/members/service";

describe("member service", () => {
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
});
