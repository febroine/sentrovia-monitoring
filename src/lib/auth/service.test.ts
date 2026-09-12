import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createdUser: {
    id: "user-1",
    firstName: "Aykut",
    lastName: "Bayram",
    email: "aykut@example.com",
    department: "SRE",
    username: "aykut.bayram",
    role: "operator",
    sessionVersion: 1,
    createdAt: new Date("2026-05-18T07:00:00.000Z"),
  },
  hash: vi.fn(),
  compare: vi.fn(),
  insertValues: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
  transactionExecute: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: mocks.hash,
    compare: mocks.compare,
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
  getAuthSessionId: () => "test-deployment",
}));

import {
  createInitialAdmin,
  createMember,
  getActiveSessionUser,
  isCurrentSessionVersion,
  loginUser,
} from "@/lib/auth/service";

describe("auth service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createdUser.role = "operator";
    mocks.hash.mockResolvedValue("hashed-password");
    mocks.compare.mockResolvedValue(true);
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
    const result = await createMember("workspace-1", {
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
        role: "operator",
      })
    );
    expect(mocks.insertValues).toHaveBeenCalledWith({ userId: "user-1" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(result.user.department).toBe("SRE");
    expect(result.user.role).toBe("operator");
  });

  it("rejects a legacy email that differs only by letter case", async () => {
    mocks.select.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([{
            id: "existing-user",
            email: "Aykut@Example.com",
            username: null,
          }])),
        })),
      })),
    });

    await expect(createMember("workspace-1", {
      firstName: "Aykut",
      lastName: "Bayram",
      username: null,
      email: "aykut@example.com",
      department: "SRE",
      password: "StrongPass!123",
      confirmPassword: "StrongPass!123",
    })).rejects.toMatchObject({
      message: "An account with this email already exists.",
      status: 409,
    });

    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects stale session versions after a credential change", () => {
    expect(isCurrentSessionVersion(1, 2)).toBe(false);
    expect(isCurrentSessionVersion(2, 2)).toBe(true);
  });

  it("rejects login for a retained user without an active workspace membership", async () => {
    mocks.select
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([{
              ...mocks.createdUser,
              passwordHash: "hashed-password",
            }])),
          })),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([])),
            })),
          })),
        })),
      });

    await expect(loginUser({
      identifier: "aykut@example.com",
      password: "StrongPass!123",
    })).rejects.toMatchObject({
      message: "This account does not belong to an active workspace.",
      status: 403,
    });

    expect(mocks.compare).toHaveBeenCalledWith("StrongPass!123", "hashed-password");
  });

  it("invalidates an existing session after its workspace membership is removed", async () => {
    mocks.select
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([mocks.createdUser])),
          })),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([])),
            })),
          })),
        })),
      });

    await expect(getActiveSessionUser(
      mocks.createdUser.id,
      mocks.createdUser.sessionVersion,
      "workspace-removed"
    )).resolves.toBeNull();
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

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.transactionExecute).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
