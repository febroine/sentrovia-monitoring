import "@/worker/load-env";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env, getAppEncryptionSecret, getDatabaseUrl } from "@/lib/env";
import { decryptDatabaseBackup, encryptDatabaseDump } from "@/lib/system/database-backup-archive";
import { buildPostgresCommandEnvironment, runPostgresCommand } from "@/lib/system/postgres-command";

async function main() {
  const directory = path.resolve(env.automaticBackupDirectory);
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const base = `sentrovia-before-release-${stamp}-${crypto.randomUUID()}`;
  const dumpPath = path.join(directory, `.${base}.dump`);
  const verifyPath = path.join(directory, `.${base}.verify.dump`);
  const backupPath = path.join(directory, `${base}.sentrovia-backup`);

  try {
    const connection = buildPostgresCommandEnvironment(getDatabaseUrl());
    await runPostgresCommand(env.pgDumpPath, [
      ...connection.args, "--format=custom", "--no-owner", "--no-acl", "--file", dumpPath,
    ], connection.environment, "pg_dump");
    await assertDump(dumpPath);
    await encryptDatabaseDump(dumpPath, backupPath, getAppEncryptionSecret());
    await decryptDatabaseBackup(backupPath, verifyPath, getAppEncryptionSecret());
    await assertDump(verifyPath);
    await runPostgresCommand(env.pgRestorePath, ["--list", verifyPath], process.env, "pg_restore verification");
    console.log(`Verified pre-release backup: ${backupPath}`);
  } catch (error) {
    await fs.promises.rm(backupPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await Promise.all([
      fs.promises.rm(dumpPath, { force: true }),
      fs.promises.rm(verifyPath, { force: true }),
    ]);
  }
}

async function assertDump(filePath: string) {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const header = Buffer.alloc(5);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== header.length || header.toString("ascii") !== "PGDMP") {
      throw new Error("pg_dump did not produce a PostgreSQL custom-format archive.");
    }
  } finally {
    await handle.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Pre-release backup failed.");
  process.exitCode = 1;
});
