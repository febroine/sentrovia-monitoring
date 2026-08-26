import { describe, expect, it } from "vitest";
import { applyImportDefaults } from "@/lib/monitors/import-defaults";
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
});
