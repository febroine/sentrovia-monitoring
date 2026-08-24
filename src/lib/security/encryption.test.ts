import { describe, expect, it } from "vitest";
import {
  decryptValue,
  decryptValueOrLegacyPlaintext,
  encryptValue,
  hashSecretValue,
  isEncryptedValue,
} from "@/lib/security/encryption";

describe("encrypted application secrets", () => {
  it("round-trips authenticated ciphertext and fails closed for tampering", () => {
    const encrypted = encryptValue("123456:telegram-secret");
    const parts = encrypted.split(":");
    parts[1] = `${parts[1].startsWith("A") ? "B" : "A"}${parts[1].slice(1)}`;

    expect(isEncryptedValue(encrypted)).toBe(true);
    expect(decryptValue(encrypted)).toBe("123456:telegram-secret");
    expect(decryptValue(parts.join(":"))).toBeNull();
  });

  it("reads legacy tokens without mistaking corrupt ciphertext for plaintext", () => {
    expect(decryptValueOrLegacyPlaintext("legacy-heartbeat-token")).toBe("legacy-heartbeat-token");
    expect(decryptValueOrLegacyPlaintext("123456:legacy-telegram-token")).toBe("123456:legacy-telegram-token");
    expect(decryptValueOrLegacyPlaintext("invalid:cipher:text")).toBeNull();
  });

  it("creates stable domain-separated secret hashes", () => {
    expect(hashSecretValue("heartbeat-token", "token-a")).toBe(
      hashSecretValue("heartbeat-token", "token-a")
    );
    expect(hashSecretValue("heartbeat-token", "token-a")).not.toBe(
      hashSecretValue("other-domain", "token-a")
    );
  });
});
