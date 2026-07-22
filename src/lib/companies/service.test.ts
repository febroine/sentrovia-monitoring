import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  updatedValues: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: mocks.transaction,
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.delete,
  },
}));

import { createCompany } from "@/lib/companies/service";

describe("company service", () => {
  const company = {
    id: "company-1",
    userId: "user-1",
    name: "Operations",
    description: null,
    isActive: true,
    createdAt: new Date("2026-07-22T07:00:00.000Z"),
    updatedAt: new Date("2026-07-22T07:00:00.000Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updatedValues.length = 0;
    mocks.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    });
    mocks.insert.mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([company])),
      })),
    });
    mocks.update.mockReturnValue({
      set: vi.fn((values: Record<string, unknown>) => {
        mocks.updatedValues.push(values);
        return { where: vi.fn(() => Promise.resolve([])) };
      }),
    });
    mocks.delete.mockReturnValue({ where: vi.fn(() => Promise.resolve([])) });
    mocks.transaction.mockImplementation(async (callback) => callback({
      select: mocks.select,
      insert: mocks.insert,
      update: mocks.update,
      delete: mocks.delete,
    }));
  });

  it("creates a company inside a transaction", async () => {
    const result = await createCompany("user-1", {
      name: "Operations",
      description: null,
      isActive: true,
    });

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ id: "company-1", monitorsCount: 0, activeMonitors: 0 });
  });

  it("clears a stale public status scope before reusing an expired company name", async () => {
    mocks.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ id: "expired-company" }])),
      })),
    });

    await createCompany("user-1", {
      name: "Operations",
      description: null,
      isActive: true,
    });

    expect(mocks.updatedValues).toContainEqual(expect.objectContaining({
      publicStatusEnabled: false,
      publicStatusCompanyId: null,
    }));
    expect(mocks.delete).toHaveBeenCalledOnce();
  });
});
