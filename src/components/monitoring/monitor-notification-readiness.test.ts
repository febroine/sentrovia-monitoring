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
