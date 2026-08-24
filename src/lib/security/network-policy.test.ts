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

describe("private target authorization", () => {
  it("allows private targets only for administrators", async () => {
    await expect(canUserAccessPrivateTargets("admin-1", buildDatabase("admin"))).resolves.toBe(true);
    await expect(canUserAccessPrivateTargets("manager-1", buildDatabase("manager"))).resolves.toBe(false);
    await expect(canUserAccessPrivateTargets("operator-1", buildDatabase("operator"))).resolves.toBe(false);
    await expect(canUserAccessPrivateTargets("viewer-1", buildDatabase("viewer"))).resolves.toBe(false);
  });
});

function buildDatabase(role: "admin" | "manager" | "operator" | "viewer") {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ role }],
        }),
      }),
    }),
  } as never;
}
