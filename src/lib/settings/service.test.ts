import { describe, expect, it } from "vitest";
import { decryptValue } from "@/lib/security/encryption";
import {
  mergeSettingsScopes,
  resolveConfiguredSecretEncrypted,
  resolveSmtpPasswordEncrypted,
} from "@/lib/settings/service";

describe("settings service", () => {
  it("keeps an existing SMTP password when the form leaves the password blank", () => {
    expect(resolveSmtpPasswordEncrypted("", true, "encrypted-secret")).toBe("encrypted-secret");
  });

  it("clears an existing SMTP password when the payload says no password is configured", () => {
    expect(resolveSmtpPasswordEncrypted("", false, "encrypted-secret")).toBeNull();
  });

  it("stores a new SMTP password when one is provided", () => {
    const encrypted = resolveSmtpPasswordEncrypted(" new-secret ", true, "old-secret");

    expect(encrypted).not.toBe("old-secret");
    expect(decryptValue(encrypted)).toBe("new-secret");
  });
});

describe("configured notification secrets", () => {
  it("preserves, replaces, and clears encrypted workspace Telegram tokens", () => {
    expect(resolveConfiguredSecretEncrypted("", true, "encrypted-token")).toBe("encrypted-token");
    expect(resolveConfiguredSecretEncrypted("", false, "encrypted-token")).toBeNull();

    const replacement = resolveConfiguredSecretEncrypted(" new-token ", true, "encrypted-token");
    expect(decryptValue(replacement)).toBe("new-token");
  });
});

describe("workspace settings scope", () => {
  it("overrides operational values while preserving each member's personal preferences", () => {
    const merged = mergeSettingsScopes(
      {
        smtpHost: "personal.invalid",
        compactDensity: true,
        timeZone: "Europe/Istanbul",
      },
      {
        smtp_host: "smtp.workspace.test",
        compact_density: false,
        time_zone: "UTC",
      }
    );

    expect(merged.smtpHost).toBe("smtp.workspace.test");
    expect(merged.compactDensity).toBe(true);
    expect(merged.timeZone).toBe("Europe/Istanbul");
  });
});
