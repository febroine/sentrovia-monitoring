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
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getKey(),
      Buffer.from(ivPart, "base64")
    );
    decipher.setAuthTag(Buffer.from(authTagPart, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}
