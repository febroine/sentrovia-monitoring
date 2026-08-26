import { describe, expect, it } from "vitest";
import { resolveNotificationRouting } from "@/lib/notifications/routing";

const workspaceFallbacks = {
  monitorEmail: null,
  monitorTelegramBotToken: null,
  monitorTelegramChatId: null,
  companyEmails: null,
  companyTelegramBotToken: null,
  companyTelegramChatId: null,
  workspaceEmail: "workspace@example.com",
  workspaceTelegramBotToken: "workspace-token",
  workspaceTelegramChatId: "workspace-chat",
};

describe("resolveNotificationRouting", () => {
  it("prefers complete monitor routing over company and workspace defaults", () => {
    expect(resolveNotificationRouting({
      ...workspaceFallbacks,
      monitorEmail: "monitor@example.com",
      monitorTelegramBotToken: "monitor-token",
      monitorTelegramChatId: "monitor-chat",
      companyEmails: ["company@example.com"],
      companyTelegramBotToken: "company-token",
      companyTelegramChatId: "company-chat",
    })).toEqual({
      emailRecipients: "monitor@example.com",
      telegramBotToken: "monitor-token",
      telegramChatId: "monitor-chat",
    });
  });

  it("uses company routing before workspace defaults", () => {
    expect(resolveNotificationRouting({
      ...workspaceFallbacks,
      companyEmails: ["ops@example.com", "noc@example.com"],
      companyTelegramBotToken: "company-token",
      companyTelegramChatId: "company-chat",
    })).toEqual({
      emailRecipients: "ops@example.com, noc@example.com",
      telegramBotToken: "company-token",
      telegramChatId: "company-chat",
    });
  });

  it("ignores incomplete Telegram overrides instead of mixing levels", () => {
    expect(resolveNotificationRouting({
      ...workspaceFallbacks,
      monitorTelegramBotToken: "partial-monitor-token",
      companyTelegramBotToken: "partial-company-token",
    })).toEqual({
      emailRecipients: "workspace@example.com",
      telegramBotToken: "workspace-token",
      telegramChatId: "workspace-chat",
    });
  });
});
