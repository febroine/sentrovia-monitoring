import { describe, expect, it } from "vitest";
import { getMonitorNotificationReadiness } from "@/components/monitoring/monitor-notification-readiness";
import { DEFAULT_MONITOR_FORM } from "@/lib/monitors/types";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";

describe("monitor notification readiness", () => {
  it("identifies missing transport and destination for the default channel choice", () => {
    const result = getMonitorNotificationReadiness(
      { ...DEFAULT_MONITOR_FORM, notificationPref: "both" },
      DEFAULT_SETTINGS,
      undefined,
      false,
    );
    expect(result.map((item) => [item.channel, item.ready])).toEqual([["Email", false], ["Telegram", false]]);
  });

  it("does not count a company address limited to other monitors as a recipient", () => {
    const company = {
      notificationEmailRecipients: ["manager@abc.test"],
      notificationEmailScopes: { "manager@abc.test": ["monitor-2"] },
      telegramBotTokenConfigured: false,
      telegramChatId: "",
    } as unknown as Parameters<typeof getMonitorNotificationReadiness>[2];
    const settings = { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications, smtpHost: "smtp.example.test", smtpFromEmail: "alerts@example.test", smtpDefaultToEmail: "" } };

    const other = getMonitorNotificationReadiness({ ...DEFAULT_MONITOR_FORM, notificationPref: "email" }, settings, company, true, "monitor-1");
    const selected = getMonitorNotificationReadiness({ ...DEFAULT_MONITOR_FORM, notificationPref: "email" }, settings, company, true, "monitor-2");

    expect(other[0].ready).toBe(false);
    expect(selected[0].ready).toBe(true);
  });

  it("accepts monitor-level Telegram routing and workspace email setup", () => {
    const result = getMonitorNotificationReadiness(
      { ...DEFAULT_MONITOR_FORM, notificationPref: "both", telegramBotToken: "token", telegramChatId: "123" },
      { ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications, smtpHost: "smtp.example.test", smtpFromEmail: "alerts@example.test", smtpDefaultToEmail: "ops@example.test" } },
      undefined,
      false,
    );
    expect(result.every((item) => item.ready)).toBe(true);
  });
});
