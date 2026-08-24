import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
});

async function createTemporaryDirectory() {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sentrovia-backup-test-"));
  temporaryDirectories.push(directory);
  return directory;
}
