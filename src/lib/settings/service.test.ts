import { describe, expect, it } from "vitest";
import { decryptValue } from "@/lib/security/encryption";
import { resolveSmtpPasswordEncrypted } from "@/lib/settings/service";

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
