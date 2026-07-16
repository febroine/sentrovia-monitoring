import { describe, expect, it } from "vitest";
import {
  buildMonitorConfigImportPreview,
  parseMonitorConfigBundle,
  redactMonitorExportSecrets,
} from "@/lib/monitors/config-service";
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

describe("monitor config import preview", () => {
  it("skips targets that already exist or repeat inside the import", () => {
    const preview = buildMonitorConfigImportPreview([
      { ...DEFAULT_MONITOR_FORM, name: "Existing", url: "https://existing.example.com" },
      { ...DEFAULT_MONITOR_FORM, name: "New", url: "https://new.example.com" },
      { ...DEFAULT_MONITOR_FORM, name: "Repeated", url: "https://new.example.com" },
    ], [{ monitorType: "http", url: "https://existing.example.com/" }]);

    expect(preview.summary).toEqual({ added: 1, skipped: 2, invalid: 0 });
    expect(preview.items.map((item) => item.status)).toEqual(["skipped", "added", "skipped"]);
  });

  it("keeps heartbeat monitors whose tokens will be generated during import", () => {
    const preview = buildMonitorConfigImportPreview([
      { ...DEFAULT_MONITOR_FORM, name: "Job A", monitorType: "heartbeat", heartbeatToken: "" },
      { ...DEFAULT_MONITOR_FORM, name: "Job B", monitorType: "heartbeat", heartbeatToken: "" },
    ], []);

    expect(preview.summary).toEqual({ added: 2, skipped: 0, invalid: 0 });
    expect(preview.items.map((item) => item.status)).toEqual(["added", "added"]);
  });

  it("marks network-policy failures as invalid without reserving their targets", () => {
    const inputs = [
      { ...DEFAULT_MONITOR_FORM, name: "Blocked", url: "http://127.0.0.1/private" },
      { ...DEFAULT_MONITOR_FORM, name: "Allowed", url: "https://allowed.example.com" },
    ];
    const preview = buildMonitorConfigImportPreview(
      inputs,
      [],
      ["Monitor target is not allowed by the current network safety policy.", null]
    );

    expect(preview.summary).toEqual({ added: 1, skipped: 0, invalid: 1 });
    expect(preview.items.map((item) => item.status)).toEqual(["invalid", "added"]);
  });
});
