import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculateFileSha256,
  decryptDatabaseBackup,
  encryptDatabaseDump,
} from "@/lib/system/database-backup-archive";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.promises.rm(directory, { recursive: true, force: true })
  ));
});

describe("encrypted database backup archives", () => {
  it("round-trips binary dumps without buffering the file in application memory", async () => {
    const directory = await createTemporaryDirectory();
    const source = path.join(directory, "source.dump");
    const encrypted = path.join(directory, "backup.sentrovia");
    const restored = path.join(directory, "restored.dump");
    const payload = Buffer.concat([Buffer.from("PGDMP"), crypto.randomBytes(256 * 1024)]);
    await fs.promises.writeFile(source, payload);

    await encryptDatabaseDump(source, encrypted, "test-secret");
    await decryptDatabaseBackup(encrypted, restored, "test-secret");

    expect(await fs.promises.readFile(restored)).toEqual(payload);
    expect(await calculateFileSha256(encrypted)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects tampered archives and removes partial plaintext", async () => {
    const directory = await createTemporaryDirectory();
    const source = path.join(directory, "source.dump");
    const encrypted = path.join(directory, "backup.sentrovia");
    const restored = path.join(directory, "restored.dump");
    await fs.promises.writeFile(source, Buffer.concat([Buffer.from("PGDMP"), crypto.randomBytes(128)]));
    await encryptDatabaseDump(source, encrypted, "test-secret");

    const archive = await fs.promises.readFile(encrypted);
    archive[Math.floor(archive.length / 2)] ^= 0xff;
    await fs.promises.writeFile(encrypted, archive);

    await expect(decryptDatabaseBackup(encrypted, restored, "test-secret")).rejects.toThrow(/corrupt/);
    await expect(fs.promises.stat(restored)).rejects.toThrow();
  });

  it("rejects files outside the Sentrovia archive format", async () => {
    const directory = await createTemporaryDirectory();
    const source = path.join(directory, "invalid.dump");
    await fs.promises.writeFile(source, crypto.randomBytes(128));

    await expect(decryptDatabaseBackup(source, path.join(directory, "out.dump"), "secret"))
      .rejects.toThrow(/not a Sentrovia/);
  });

  it("decrypts from the verified file even if its path is replaced", async () => {
    const directory = await createTemporaryDirectory();
    const originalSource = path.join(directory, "original.dump");
    const replacementSource = path.join(directory, "replacement.dump");
    const encrypted = path.join(directory, "backup.sentrovia");
    const replacement = path.join(directory, "replacement.sentrovia");
    const restored = path.join(directory, "restored.dump");
    const originalPayload = Buffer.concat([Buffer.from("PGDMP"), crypto.randomBytes(128)]);
    const replacementPayload = Buffer.concat([Buffer.from("PGDMP"), crypto.randomBytes(128)]);
    await Promise.all([
      fs.promises.writeFile(originalSource, originalPayload),
      fs.promises.writeFile(replacementSource, replacementPayload),
    ]);
    await Promise.all([
      encryptDatabaseDump(originalSource, encrypted, "test-secret"),
      encryptDatabaseDump(replacementSource, replacement, "test-secret"),
    ]);

    const openFile = fs.promises.open.bind(fs.promises);
    let pathWasReplaced = false;
    const openSpy = vi.spyOn(fs.promises, "open").mockImplementation(async (filePath, flags, mode) => {
      const handle = await openFile(filePath, flags, mode);
      if (path.resolve(String(filePath)) !== path.resolve(encrypted)) {
        return handle;
      }

      const closeFile = handle.close.bind(handle);
      handle.close = async () => {
        await closeFile();
        if (!pathWasReplaced) {
          pathWasReplaced = true;
          await fs.promises.rm(encrypted, { force: true });
          await fs.promises.rename(replacement, encrypted);
        }
      };
      return handle;
    });

    try {
      await decryptDatabaseBackup(encrypted, restored, "test-secret");
    } finally {
      openSpy.mockRestore();
    }

    expect(pathWasReplaced).toBe(true);
    expect(await fs.promises.readFile(restored)).toEqual(originalPayload);
  });
});

async function createTemporaryDirectory() {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sentrovia-backup-test-"));
  temporaryDirectories.push(directory);
  return directory;
}
