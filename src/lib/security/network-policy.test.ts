import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();

  return {
    ...actual,
    env: {
      ...actual.env,
      monitorAllowPrivateTargets: true,
    },
  };
});

import { canUserAccessPrivateTargets } from "@/lib/security/network-policy";
import { workspaceMembers } from "@/lib/db/schema";

describe("private target authorization", () => {
  it("allows private targets only for administrators", async () => {
    await expect(canUserAccessPrivateTargets("admin-1", buildDatabase("admin"))).resolves.toBe(true);
    await expect(canUserAccessPrivateTargets("manager-1", buildDatabase("manager"))).resolves.toBe(false);
    await expect(canUserAccessPrivateTargets("operator-1", buildDatabase("operator"))).resolves.toBe(false);
    await expect(canUserAccessPrivateTargets("viewer-1", buildDatabase("viewer"))).resolves.toBe(false);
  });

  it("uses the membership role for the requested workspace", async () => {
    await expect(
      canUserAccessPrivateTargets("user-1", buildDatabase("admin", "operator"), "workspace-operator")
    ).resolves.toBe(false);
  });
});

function buildDatabase(
  userRole: "admin" | "manager" | "operator" | "viewer",
  workspaceRole = userRole
) {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => [{ role: table === workspaceMembers ? workspaceRole : userRole }],
        }),
      }),
    }),
  } as never;
}
