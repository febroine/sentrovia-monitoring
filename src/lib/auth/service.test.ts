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
  transaction: vi.fn(),
  transactionExecute: vi.fn(),
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
    transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/env", () => ({
  getAuthSecret: () => "test-secret-with-enough-length",
}));

import { createInitialAdmin, createMember, isCurrentSessionVersion } from "@/lib/auth/service";

describe("auth service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createdUser.role = "member";
    mocks.hash.mockResolvedValue("hashed-password");
    mocks.select.mockImplementation((projection) => ({
      from: vi.fn(() => {
        if (projection && typeof projection === "object" && "total" in projection) {
          return Promise.resolve([{ total: 0 }]);
        }

        return {
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        };
      }),
    }));
    mocks.insertValues.mockReturnValue({
      returning: vi.fn(() => Promise.resolve([mocks.createdUser])),
    });
    mocks.insert.mockReturnValue({
      values: mocks.insertValues,
    });
    mocks.transactionExecute.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        execute: mocks.transactionExecute,
        select: mocks.select,
        insert: mocks.insert,
      })
    );
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

  it("creates the initial admin inside an advisory-locked transaction", async () => {
    mocks.createdUser.role = "admin";

    const result = await createInitialAdmin({
      firstName: "Aykut",
      lastName: "Bayram",
      username: "aykut.bayram",
      email: "aykut@example.com",
      department: "SRE",
      password: "StrongPass!123",
      confirmPassword: "StrongPass!123",
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.transactionExecute).toHaveBeenCalledTimes(1);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "aykut@example.com",
        passwordHash: "hashed-password",
        role: "admin",
      })
    );
    expect(result.user.role).toBe("admin");
  });

  it("does not insert an initial admin when onboarding is already complete inside the lock", async () => {
    mocks.select.mockReturnValueOnce({
      from: vi.fn(() => Promise.resolve([{ total: 1 }])),
    });

    await expect(
      createInitialAdmin({
        firstName: "Aykut",
        lastName: "Bayram",
        username: "aykut.bayram",
        email: "aykut@example.com",
        department: "SRE",
        password: "StrongPass!123",
        confirmPassword: "StrongPass!123",
      })
    ).rejects.toMatchObject({
      message: "Workspace onboarding is already complete.",
      status: 409,
    });

    expect(mocks.transactionExecute).toHaveBeenCalledTimes(1);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
