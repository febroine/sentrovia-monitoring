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
    await expect(canUserAccessPrivateTargets("member-1", buildDatabase("member"))).resolves.toBe(false);
  });
});

function buildDatabase(role: "admin" | "member") {
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
