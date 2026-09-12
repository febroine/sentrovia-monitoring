import { describe, expect, it } from "vitest";
import {
  resolveNotificationRouting,
  resolveWorkspaceNotificationDefaults,
} from "@/lib/notifications/routing";

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

describe("resolveWorkspaceNotificationDefaults", () => {
  const memberLegacyDefaults = {
    email: "former-member-default@example.com",
    telegramBotToken: "encrypted-member-token",
    telegramChatId: "member-chat",
  };

  const ownerLegacyDefaults = {
    email: "former-owner-default@example.com",
    telegramBotToken: "encrypted-owner-token",
    telegramChatId: "owner-chat",
  };

  it.each([
    ["member-created", memberLegacyDefaults],
    ["owner-created", ownerLegacyDefaults],
  ])("uses current workspace routing for a %s monitor", (_label, legacyDefaults) => {
    expect(resolveWorkspaceNotificationDefaults({
      smtpDefaultToEmail: "current-workspace@example.com",
      defaultTelegramBotTokenEncrypted: "encrypted-workspace-token",
      defaultTelegramChatId: "workspace-chat",
    }, legacyDefaults)).toEqual({
      email: "current-workspace@example.com",
      telegramBotToken: "encrypted-workspace-token",
      telegramChatId: "workspace-chat",
    });
  });

  it("reads the snake-case keys written by the workspace-settings migration", () => {
    expect(resolveWorkspaceNotificationDefaults({
      smtp_default_to_email: "migrated-workspace@example.com",
      default_telegram_bot_token_encrypted: "encrypted-migrated-token",
      default_telegram_chat_id: "migrated-chat",
    }, memberLegacyDefaults)).toEqual({
      email: "migrated-workspace@example.com",
      telegramBotToken: "encrypted-migrated-token",
      telegramChatId: "migrated-chat",
    });
  });

  it("uses legacy creator defaults only when the workspace has no settings row", () => {
    expect(resolveWorkspaceNotificationDefaults(null, memberLegacyDefaults)).toEqual(memberLegacyDefaults);
    expect(resolveWorkspaceNotificationDefaults({}, memberLegacyDefaults)).toEqual({
      email: null,
      telegramBotToken: null,
      telegramChatId: null,
    });
  });
});
