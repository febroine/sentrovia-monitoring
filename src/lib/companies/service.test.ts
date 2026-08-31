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

import {
  createCompany,
  resolveCompanyTelegramCredentials,
  summarizeCompanyMonitorCounts,
} from "@/lib/companies/service";
import { decryptValue } from "@/lib/security/encryption";

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
    const result = await createCompany({ workspaceId: "workspace-1", userId: "user-1" }, {
      name: "Operations",
      description: null,
      notificationEmailRecipients: [],
      telegramBotToken: "",
      telegramBotTokenConfigured: false,
      telegramChatId: "",
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

    await createCompany({ workspaceId: "workspace-1", userId: "user-1" }, {
      name: "Operations",
      description: null,
      notificationEmailRecipients: [],
      telegramBotToken: "",
      telegramBotTokenConfigured: false,
      telegramChatId: "",
      isActive: true,
    });

    expect(mocks.updatedValues).toContainEqual(expect.objectContaining({
      publicStatusEnabled: false,
      publicStatusCompanyId: null,
    }));
    expect(mocks.delete).toHaveBeenCalledOnce();
  });
});

describe("company monitor counts", () => {
  it("counts enabled monitors as active regardless of their current health", () => {
    expect(summarizeCompanyMonitorCounts([
      { isActive: true },
      { isActive: true },
      { isActive: false },
    ])).toEqual({ total: 3, active: 2 });
  });
});

describe("company Telegram credentials", () => {
  const input = {
    name: "Operations",
    description: null,
    notificationEmailRecipients: [],
    telegramBotToken: "",
    telegramBotTokenConfigured: true,
    telegramChatId: "-1001234567890",
    isActive: true,
  };

  it("does not retain a chat ID when a claimed existing token is missing", () => {
    expect(resolveCompanyTelegramCredentials(input, null)).toEqual({
      botTokenEncrypted: null,
      chatId: null,
    });
  });

  it("encrypts a replacement token and retains its chat ID", () => {
    const resolved = resolveCompanyTelegramCredentials({
      ...input,
      telegramBotToken: "new-token",
    }, "old-token");

    expect(decryptValue(resolved.botTokenEncrypted)).toBe("new-token");
    expect(resolved.chatId).toBe("-1001234567890");
  });
});
