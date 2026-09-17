import { describe, expect, it } from "vitest";
import {
  buildMonitorConfigImportPreview,
  parseMonitorConfigBundle,
  preserveRedactedMonitorSettings,
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

  it("rejects bundles from an unsupported source or version", () => {
    expect(() => parseMonitorConfigBundle(JSON.stringify({
      version: 2,
      source: "other",
      exportedAt: new Date().toISOString(),
      monitors: [],
    }), "json")).toThrow("version or source is not supported");
  });

  it("rejects monitor config bundles with too many monitors", () => {
    const raw = JSON.stringify({
      version: 1,
      source: "sentrovia",
      exportedAt: new Date().toISOString(),
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

    expect(preview.summary).toEqual({ added: 1, updated: 0, skipped: 2, invalid: 0 });
    expect(preview.items.map((item) => item.status)).toEqual(["skipped", "added", "skipped"]);
  });

  it("keeps heartbeat monitors whose tokens will be generated during import", () => {
    const preview = buildMonitorConfigImportPreview([
      { ...DEFAULT_MONITOR_FORM, name: "Job A", monitorType: "heartbeat", heartbeatToken: "" },
      { ...DEFAULT_MONITOR_FORM, name: "Job B", monitorType: "heartbeat", heartbeatToken: "" },
    ], []);

    expect(preview.summary).toEqual({ added: 2, updated: 0, skipped: 0, invalid: 0 });
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

    expect(preview.summary).toEqual({ added: 1, updated: 0, skipped: 0, invalid: 1 });
    expect(preview.items.map((item) => item.status)).toEqual(["invalid", "added"]);
  });

  it("distinguishes updated, unchanged, and duplicate bundle records", () => {
    const current = { ...DEFAULT_MONITOR_FORM, name: "Original", url: "https://existing.example.com" };
    const preview = buildMonitorConfigImportPreview([
      { ...current, name: "Renamed" },
      { ...current },
      { ...DEFAULT_MONITOR_FORM, name: "New", url: "https://new.example.com" },
    ], [{ id: "monitor-1", monitorType: "http", url: current.url, config: current }], [], {
      updateExisting: true,
      ids: ["monitor-1", "monitor-1", undefined],
    });

    expect(preview.summary).toEqual({ added: 1, updated: 1, skipped: 1, invalid: 0 });
    expect(preview.items.map((item) => item.status)).toEqual(["updated", "skipped", "added"]);
    expect(preview.items[0].monitorId).toBe("monitor-1");
    expect(preview.items[0].changedFields).toContain("name");
  });

  it("preserves a redacted workspace-level Telegram preference", () => {
    const current = { ...DEFAULT_MONITOR_FORM, notificationPref: "both" as const };
    const imported = { ...current, notificationPref: "email" as const };

    expect(preserveRedactedMonitorSettings(imported, current).notificationPref).toBe("both");
    const preview = buildMonitorConfigImportPreview([imported], [
      { id: "monitor-1", monitorType: "http", url: current.url, config: current },
    ], [], { updateExisting: true, ids: ["monitor-1"] });
    expect(preview.items[0].status).toBe("skipped");
    expect(preserveRedactedMonitorSettings(imported, current, true).notificationPref).toBe("email");
  });

  it("matches an older bundle by target when no ID is present", () => {
    const current = { ...DEFAULT_MONITOR_FORM, url: "https://existing.example.com" };
    const preview = buildMonitorConfigImportPreview([
      { ...current, intervalValue: 10 },
    ], [{ id: "monitor-1", monitorType: "http", url: current.url, config: current }], [], {
      updateExisting: true,
    });

    expect(preview.items[0].status).toBe("updated");
    expect(preview.items[0].monitorId).toBe("monitor-1");
    expect(preview.items[0].changedFields).toEqual(["intervalValue"]);
  });

  it("preserves redacted Telegram credentials and preference during an update", () => {
    const current = {
      ...DEFAULT_MONITOR_FORM,
      telegramBotToken: "123456:secret",
      telegramChatId: "123456",
      notificationPref: "both" as const,
    };
    const imported = {
      ...current,
      telegramBotToken: "",
      telegramChatId: "",
      notificationPref: "email" as const,
    };

    expect(preserveRedactedMonitorSettings(imported, current)).toMatchObject({
      telegramBotToken: "123456:secret",
      telegramChatId: "123456",
      notificationPref: "both",
    });
  });

  it("requires an ID to match a redacted heartbeat in update mode", () => {
    const preview = buildMonitorConfigImportPreview([
      { ...DEFAULT_MONITOR_FORM, name: "Daily job", monitorType: "heartbeat", heartbeatToken: "" },
    ], [], [], { updateExisting: true });

    expect(preview.items[0].status).toBe("invalid");
  });

  it("asks for the database password before changing a PostgreSQL connection", () => {
    const current = {
      ...DEFAULT_MONITOR_FORM,
      monitorType: "postgres" as const,
      databaseHost: "db.example.com",
      databaseName: "app",
      databaseUsername: "app",
      databasePasswordConfigured: true,
    };
    const preview = buildMonitorConfigImportPreview([
      { ...current, databaseTlsVerify: false },
    ], [{ id: "monitor-1", monitorType: "postgres", url: "postgres://app@db.example.com:5432/app", config: current }], [], {
      updateExisting: true,
      ids: ["monitor-1"],
    });

    expect(preview.items[0].status).toBe("invalid");
    expect(preview.items[0].reason).toContain("Re-enter the database password");
  });
});
