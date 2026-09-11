import { describe, expect, it } from "vitest";
import { decryptValue } from "@/lib/security/encryption";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import {
  mergeSettingsScopes,
  resolveConfiguredSecretEncrypted,
  resolveSmtpPasswordEncrypted,
} from "@/lib/settings/service";

describe("settings service", () => {
  const smtp = { ...DEFAULT_SETTINGS.notifications, smtpHost: "smtp.example.com", smtpUsername: "mailer", smtpPasswordConfigured: true };
  const existing = { ...smtp, smtpPasswordEncrypted: "encrypted-secret" };

  it("keeps an existing SMTP password when the form leaves the password blank", () => {
    expect(resolveSmtpPasswordEncrypted(smtp, existing)).toBe("encrypted-secret");
  });

  it("clears an existing SMTP password when the payload says no password is configured", () => {
    expect(resolveSmtpPasswordEncrypted({ ...smtp, smtpPasswordConfigured: false }, existing)).toBeNull();
  });

  it("stores a new SMTP password when one is provided", () => {
    const encrypted = resolveSmtpPasswordEncrypted({ ...smtp, smtpPassword: " new-secret ", smtpHost: "new.example.com" }, existing);

    expect(encrypted).not.toBe("old-secret");
    expect(decryptValue(encrypted)).toBe("new-secret");
  });

  it.each([
    { smtpHost: "attacker.example.com" }, { smtpPort: 2525 }, { smtpUsername: "attacker" },
    { smtpSecure: true }, { smtpRequireTls: false }, { smtpInsecureSkipVerify: true },
  ])("rejects retained credentials after SMTP connection changes: %j", (changes) => {
    expect(() => resolveSmtpPasswordEncrypted({ ...smtp, ...changes }, existing)).toThrow(/re-enter.*password/i);
  });

  it("allows hostname casing and unrelated notification changes", () => {
    expect(resolveSmtpPasswordEncrypted({ ...smtp, smtpHost: "SMTP.EXAMPLE.COM", notifyOnDown: false }, existing)).toBe("encrypted-secret");
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
        default_monitor_notification_pref: "telegram",
        compact_density: false,
        time_zone: "UTC",
      }
    );

    expect(merged.smtpHost).toBe("smtp.workspace.test");
    expect(merged.defaultMonitorNotificationPref).toBe("telegram");
    expect(merged.compactDensity).toBe(true);
    expect(merged.timeZone).toBe("Europe/Istanbul");
  });
});
