import crypto from "node:crypto";
import { getAppEncryptionSecret } from "@/lib/env";

const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function getKey() {
  return crypto.createHash("sha256").update(getAppEncryptionSecret()).digest().subarray(0, KEY_LENGTH);
}

export function encryptValue(value: string) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptValue(payload: string | null | undefined) {
  if (!payload) {
    return null;
  }

  const [ivPart, authTagPart, encryptedPart] = payload.split(":");
  if (!ivPart || !authTagPart || !encryptedPart) {
    return null;
  }

  try {
    const iv = Buffer.from(ivPart, "base64");
    const authTag = Buffer.from(authTagPart, "base64");
    if (iv.length !== IV_LENGTH || authTag.length !== 16) {
      return null;
    }

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getKey(),
      iv
    );
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function decryptValueOrLegacyPlaintext(payload: string | null | undefined) {
  if (!payload) {
    return null;
  }

  const decrypted = decryptValue(payload);
  if (decrypted !== null) {
    return decrypted;
  }

  return payload.split(":").length < 3 ? payload : null;
}

export function isEncryptedValue(payload: string | null | undefined) {
  return decryptValue(payload) !== null;
}

export function hashSecretValue(domain: string, value: string) {
  return crypto
    .createHmac("sha256", getKey())
    .update(domain)
    .update("\0")
    .update(value)
    .digest("hex");
}
