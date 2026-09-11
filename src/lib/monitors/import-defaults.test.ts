import { describe, expect, it } from "vitest";
import { applyImportDefaults, normalizeImportedMonitorUrl } from "@/lib/monitors/import-defaults";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";

const intervalDefaults = { intervalValue: 5, intervalUnit: "dk" as const };

describe("applyImportDefaults", () => {
  it("preserves valid zero values from CSV imports", () => {
    const result = applyImportDefaults(
      { responseMaxLength: 0, retries: 0, maxRedirects: 0 },
      null,
      intervalDefaults
    );

    expect(result.responseMaxLength).toBe(0);
    expect(result.retries).toBe(0);
    expect(result.maxRedirects).toBe(0);
  });

  it("fills empty CSV cells without replacing explicit invalid numeric values", () => {
    const result = applyImportDefaults(
      { intervalValue: 0, timeout: 0, responseMaxLength: "" },
      null,
      intervalDefaults
    );

    expect(result.intervalValue).toBe(0);
    expect(result.timeout).toBe(0);
    expect(result.responseMaxLength).toBe(1024);
  });

  it("applies the workspace slow-response threshold when an import omits it", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.monitoring.slowResponseThresholdMs = 20_000;

    const inherited = applyImportDefaults({}, settings, intervalDefaults);
    const explicit = applyImportDefaults({ slowResponseThresholdMs: 12_000 }, settings, intervalDefaults);

    expect(inherited.slowResponseThresholdMs).toBe(20_000);
    expect(explicit.slowResponseThresholdMs).toBe(12_000);
  });

  it("uses workspace notification and public visibility defaults", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.notifications.defaultMonitorNotificationPref = "telegram";

    expect(applyImportDefaults({}, settings, intervalDefaults)).toMatchObject({
      notificationPref: "telegram",
      publishOnStatusPage: true,
    });
    expect(applyImportDefaults({ notificationPref: "none", publishOnStatusPage: false }, settings, intervalDefaults))
      .toMatchObject({ notificationPref: "none", publishOnStatusPage: false });
  });

  it.each([
    ["example.com/health", "https://example.com/health"],
    ["www.example.com", "https://www.example.com"],
    ["http://example.com", "http://example.com"],
    ["https://example.com", "https://example.com"],
    ["//example.com/status", "https://example.com/status"],
  ])("normalizes imported HTTP target %s", (input, expected) => {
    expect(normalizeImportedMonitorUrl(input, "http")).toBe(expected);
  });

  it("does not rewrite non-HTTP monitor targets", () => {
    expect(normalizeImportedMonitorUrl("db.example.com:5432", "postgres")).toBe("db.example.com:5432");
  });
});
