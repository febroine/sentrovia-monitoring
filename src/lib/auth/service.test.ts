import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createdUser: {
    id: "user-1",
    firstName: "Aykut",
    lastName: "Bayram",
    email: "aykut@example.com",
    department: "SRE",
    createdAt: new Date("2026-05-18T07:00:00.000Z"),
  },
  hash: vi.fn(),
  createSessionToken: vi.fn(),
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

vi.mock("@/lib/auth/token", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/token")>();

  return {
    ...actual,
    createSessionToken: mocks.createSessionToken,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    authAllowPublicSignup: true,
  },
  getAuthSecret: () => "test-secret-with-enough-length",
}));

import { registerUser } from "@/lib/auth/service";

describe("auth service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hash.mockResolvedValue("hashed-password");
    mocks.createSessionToken.mockResolvedValue("session-token");
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

  it("persists the optional department during registration", async () => {
    const result = await registerUser({
      firstName: "Aykut",
      lastName: "Bayram",
      email: "aykut@example.com",
      department: "SRE",
      password: "StrongPass!123",
      confirmPassword: "StrongPass!123",
    });

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: "Aykut",
        lastName: "Bayram",
        email: "aykut@example.com",
        department: "SRE",
        passwordHash: "hashed-password",
      })
    );
    expect(result.user.department).toBe("SRE");
    expect(result.token).toBe("session-token");
  });
});
