import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createdUser: {
    id: "user-1",
    firstName: "Aykut",
    lastName: "Bayram",
    email: "aykut@example.com",
    department: "SRE",
    username: "aykut.bayram",
    role: "member",
    sessionVersion: 1,
    createdAt: new Date("2026-05-18T07:00:00.000Z"),
  },
  hash: vi.fn(),
  insertValues: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: mocks.hash,
    compare: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
  },
}));

vi.mock("@/lib/env", () => ({
  getAuthSecret: () => "test-secret-with-enough-length",
}));

import { createMember, isCurrentSessionVersion } from "@/lib/auth/service";

describe("auth service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hash.mockResolvedValue("hashed-password");
    mocks.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    });
    mocks.insertValues.mockReturnValue({
      returning: vi.fn(() => Promise.resolve([mocks.createdUser])),
    });
    mocks.insert.mockReturnValue({
      values: mocks.insertValues,
    });
  });

  it("persists the optional department during member creation", async () => {
    const result = await createMember({
      firstName: "Aykut",
      lastName: "Bayram",
      username: "aykut.bayram",
      email: "aykut@example.com",
      department: "SRE",
      password: "StrongPass!123",
      confirmPassword: "StrongPass!123",
    });

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: "Aykut",
        lastName: "Bayram",
        username: "aykut.bayram",
        email: "aykut@example.com",
        department: "SRE",
        passwordHash: "hashed-password",
        role: "member",
      })
    );
    expect(result.user.department).toBe("SRE");
    expect(result.user.role).toBe("member");
  });

  it("rejects stale session versions after a credential change", () => {
    expect(isCurrentSessionVersion(1, 2)).toBe(false);
    expect(isCurrentSessionVersion(2, 2)).toBe(true);
  });
});
