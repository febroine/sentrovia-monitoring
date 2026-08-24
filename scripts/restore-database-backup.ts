import "@/worker/load-env";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decryptDatabaseBackup } from "@/lib/system/database-backup-archive";
import { buildPostgresCommandEnvironment, runPostgresCommand } from "@/lib/system/postgres-command";
import { env, getAppEncryptionSecret, getDatabaseUrl } from "@/lib/env";

const RESTORE_CONFIRMATION = "REPLACE_DATABASE";

async function main() {
  const backupPath = resolveBackupPath(process.argv[2]);
  const restoreRequested = process.argv.includes("--restore");
  if (restoreRequested && !process.argv.includes(`--confirm=${RESTORE_CONFIRMATION}`)) {
    throw new Error(`Database restore requires --confirm=${RESTORE_CONFIRMATION}. Stop Sentrovia services first.`);
  }

  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sentrovia-db-restore-"));
  const dumpPath = path.join(temporaryDirectory, "database.dump");
  try {
    await decryptDatabaseBackup(backupPath, dumpPath, getAppEncryptionSecret());
    if (restoreRequested) {
      await restoreDump(dumpPath);
      console.log("Database restore completed successfully.");
    } else {
      await runPostgresCommand(env.pgRestorePath, ["--list", dumpPath], process.env, "pg_restore verification");
      console.log("Backup decryption and pg_restore verification succeeded. No database changes were made.");
    }
  } finally {
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function restoreDump(dumpPath: string) {
  const connection = buildPostgresCommandEnvironment(getDatabaseUrl());
  await runPostgresCommand(env.pgRestorePath, [
    ...connection.args,
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-acl",
    "--exit-on-error",
    dumpPath,
  ], connection.environment, "pg_restore");
}

function resolveBackupPath(value: string | undefined) {
  if (!value || value.startsWith("--")) {
    throw new Error("Usage: npm run backup:restore -- <backup-file> [--restore --confirm=REPLACE_DATABASE]");
  }
  const resolved = path.resolve(value);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`Backup file not found: ${resolved}`);
  }
  return resolved;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Database backup operation failed.");
  process.exitCode = 1;
});
