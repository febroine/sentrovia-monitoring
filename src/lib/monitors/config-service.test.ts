import { describe, expect, it } from "vitest";
import { parseMonitorConfigBundle, redactMonitorExportSecrets } from "@/lib/monitors/config-service";
import { DEFAULT_MONITOR_FORM } from "@/lib/monitors/types";

describe("monitor config bundle parsing", () => {
  it("returns a config validation error for malformed YAML", () => {
    expect(() => parseMonitorConfigBundle("monitors: [", "yaml")).toThrow(
      "The uploaded monitor config bundle is invalid."
    );
  });

  it("rejects oversized monitor config bundles before parsing", () => {
    const raw = JSON.stringify({
      monitors: [
        {
          ...DEFAULT_MONITOR_FORM,
          name: "Large monitor",
          url: `https://example.com/${"x".repeat(1_000_000)}`,
        },
      ],
    });

    expect(() => parseMonitorConfigBundle(raw, "json")).toThrow(
      "The uploaded monitor config bundle is too large."
    );
  });

  it("rejects monitor config bundles with too many monitors", () => {
    const raw = JSON.stringify({
      monitors: Array.from({ length: 501 }, (_, index) => ({
        ...DEFAULT_MONITOR_FORM,
        name: `Monitor ${index}`,
        url: `https://example-${index}.com`,
      })),
    });

    expect(() => parseMonitorConfigBundle(raw, "json")).toThrow(
      "Import at most 500 monitors at a time."
    );
  });
});

describe("monitor config export redaction", () => {
  it("removes monitor secrets from exported payloads", () => {
    const exported = redactMonitorExportSecrets({
      ...DEFAULT_MONITOR_FORM,
      name: "Secret-backed monitor",
      monitorType: "heartbeat",
      heartbeatToken: "heartbeat-token-that-should-not-export",
      notificationPref: "both",
      telegramBotToken: "123456:secret-token",
      telegramChatId: "-1001234567890",
    });

    expect(exported.heartbeatToken).toBe("");
    expect(exported.telegramBotToken).toBe("");
    expect(exported.telegramChatId).toBe("");
    expect(exported.notificationPref).toBe("email");
  });

  it("disables telegram-only delivery when its secret is redacted", () => {
    const exported = redactMonitorExportSecrets({
      ...DEFAULT_MONITOR_FORM,
      name: "Telegram monitor",
      notificationPref: "telegram",
      telegramBotToken: "123456:secret-token",
      telegramChatId: "-1001234567890",
    });

    expect(exported.notificationPref).toBe("none");
    expect(exported.telegramBotToken).toBe("");
    expect(exported.telegramChatId).toBe("");
  });
});
