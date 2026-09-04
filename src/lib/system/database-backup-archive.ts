import crypto from "node:crypto";
import fs from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const BACKUP_MAGIC = Buffer.from("SENTROVIA_DATABASE_BACKUP_V1\n", "utf8");
const INITIALIZATION_VECTOR_BYTES = 12;
const AUTHENTICATION_TAG_BYTES = 16;

export async function encryptDatabaseDump(sourcePath: string, destinationPath: string, secret: string) {
  const initializationVector = crypto.randomBytes(INITIALIZATION_VECTOR_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveBackupKey(secret), initializationVector);

  async function* encryptedChunks() {
    yield BACKUP_MAGIC;
    yield initializationVector;
    for await (const chunk of fs.createReadStream(sourcePath).pipe(cipher)) {
      yield chunk;
    }
    yield cipher.getAuthTag();
  }

  await pipeline(
    Readable.from(encryptedChunks()),
    fs.createWriteStream(destinationPath, { flags: "wx", mode: 0o600 })
  );
}

export async function decryptDatabaseBackup(sourcePath: string, destinationPath: string, secret: string) {
  const sourceHandle = await fs.promises.open(sourcePath, "r");
  try {
    const metadata = await readArchiveMetadata(sourceHandle);
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      deriveBackupKey(secret),
      metadata.initializationVector
    );
    decipher.setAuthTag(metadata.authenticationTag);

    try {
      await pipeline(
        sourceHandle.createReadStream({
          start: metadata.payloadStart,
          end: metadata.payloadEnd,
          autoClose: false,
        }),
        decipher,
        fs.createWriteStream(destinationPath, { flags: "wx", mode: 0o600 })
      );
    } catch (error) {
      await fs.promises.rm(destinationPath, { force: true }).catch(() => undefined);
      throw new Error("The database backup is corrupt or was encrypted with a different key.", { cause: error });
    }
  } finally {
    await sourceHandle.close();
  }
}

export async function calculateFileSha256(filePath: string) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function readArchiveMetadata(handle: FileHandle) {
  const stats = await handle.stat();
  const minimumSize = BACKUP_MAGIC.length + INITIALIZATION_VECTOR_BYTES + AUTHENTICATION_TAG_BYTES + 1;
  if (!stats.isFile() || stats.size < minimumSize) {
    throw new Error("The database backup file is incomplete.");
  }

  const header = Buffer.alloc(BACKUP_MAGIC.length);
  const initializationVector = Buffer.alloc(INITIALIZATION_VECTOR_BYTES);
  const authenticationTag = Buffer.alloc(AUTHENTICATION_TAG_BYTES);
  await handle.read(header, 0, header.length, 0);
  if (!crypto.timingSafeEqual(header, BACKUP_MAGIC)) {
    throw new Error("The file is not a Sentrovia database backup.");
  }
  await handle.read(initializationVector, 0, initializationVector.length, BACKUP_MAGIC.length);
  await handle.read(authenticationTag, 0, authenticationTag.length, stats.size - AUTHENTICATION_TAG_BYTES);
  return {
    initializationVector,
    authenticationTag,
    payloadStart: BACKUP_MAGIC.length + INITIALIZATION_VECTOR_BYTES,
    payloadEnd: stats.size - AUTHENTICATION_TAG_BYTES - 1,
  };
}

function deriveBackupKey(secret: string) {
  return crypto
    .createHash("sha256")
    .update("sentrovia-database-backup-v1\0", "utf8")
    .update(secret, "utf8")
    .digest();
}
