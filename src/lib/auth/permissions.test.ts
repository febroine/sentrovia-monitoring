import { describe, expect, it } from "vitest";
import {
  assertPermission,
  canAssignRole,
  canManageMemberRole,
  hasPermission,
  normalizeUserRole,
} from "@/lib/auth/permissions";

describe("role permissions", () => {
  it("keeps administrators unrestricted and viewers read-only", () => {
    expect(hasPermission("admin", "backups.manage")).toBe(true);
    expect(hasPermission("viewer", "monitors.manage")).toBe(false);
    expect(() => assertPermission("viewer", "reports.manage")).toThrow(/permission/);
  });

  it("separates manager, operator, and infrastructure privileges", () => {
    expect(hasPermission("manager", "members.manage")).toBe(true);
    expect(hasPermission("operator", "members.manage")).toBe(false);
    expect(hasPermission("manager", "worker.manage")).toBe(false);
    expect(hasPermission("operator", "monitors.manage")).toBe(true);
  });

  it("prevents managers from assigning or modifying privileged roles", () => {
    expect(canAssignRole("manager", "operator")).toBe(true);
    expect(canAssignRole("manager", "admin")).toBe(false);
    expect(canManageMemberRole("manager", "viewer")).toBe(true);
    expect(canManageMemberRole("manager", "manager")).toBe(false);
  });

  it("maps legacy member accounts to operators and unknown values to viewer", () => {
    expect(normalizeUserRole("member")).toBe("operator");
    expect(normalizeUserRole("unexpected")).toBe("viewer");
  });
});
