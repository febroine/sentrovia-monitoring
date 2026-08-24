import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, asc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { automaticBackupRuns, users, userSettings } from "@/lib/db/schema";
import { env, getAppEncryptionSecret, getDatabaseUrl } from "@/lib/env";
import {
  calculateFileSha256,
  decryptDatabaseBackup,
  encryptDatabaseDump,
} from "@/lib/system/database-backup-archive";
import { buildPostgresCommandEnvironment, runPostgresCommand } from "@/lib/system/postgres-command";

export { buildPostgresCommandEnvironment } from "@/lib/system/postgres-command";

const BACKUP_RETRY_DELAY_MS = 60 * 60_000;
const BACKUP_SCHEDULE_POLL_INTERVAL_MS = 60_000;
const STALE_BACKUP_RUN_MS = 6 * 60 * 60_000;
const MAX_BACKUP_ATTEMPTS = 3;
const MAX_BACKUP_ERROR_LENGTH = 500;
const DUMP_MAGIC = Buffer.from("PGDMP", "ascii");
const BACKUP_FILE_PATTERN = /^sentrovia-db-\d{4}-\d{2}-\d{2}T\d{6}Z\.sentrovia-backup$/;

type BackupSchedule = {
  userId: string;
  enabled: boolean;
  window: string;
  retentionCount: number;
  timeZone: string;
  lastBackupAt: Date | null;
};

let activeBackup: Promise<unknown> | null = null;
let nextBackupSchedulePollAt = 0;

export function triggerAutomaticDatabaseBackup(now = new Date()) {
  if (activeBackup) return activeBackup;
  if (now.getTime() < nextBackupSchedulePollAt) {
    return Promise.resolve({ status: "poll-throttled" as const });
  }
  nextBackupSchedulePollAt = now.getTime() + BACKUP_SCHEDULE_POLL_INTERVAL_MS;
  activeBackup = runAutomaticDatabaseBackup(now)
    .catch((error) => {
      console.error("[sentrovia] Automatic database backup failed.", safeErrorMessage(error));
    })
    .finally(() => {
      activeBackup = null;
    });
  return activeBackup;
}

export async function runAutomaticDatabaseBackup(now = new Date()) {
  const schedule = await readBackupSchedule();
  if (!schedule || !isAutomaticBackupDue(schedule, now)) return { status: "not-due" as const };

  const scheduledDate = getZonedDateAndTime(now, schedule.timeZone).date;
  const run = await claimBackupRun(schedule.userId, scheduledDate, now);
  if (!run) return { status: "already-claimed" as const };

  await markBackupSettings(schedule.userId, "running", null).catch(() => undefined);
  try {
    const result = await createVerifiedBackup(scheduledDate, schedule.retentionCount, now);
    await db.transaction(async (tx) => {
      await tx
        .update(automaticBackupRuns)
        .set({
          status: "completed",
          fileName: result.fileName,
          sizeBytes: result.sizeBytes,
          checksumSha256: result.checksumSha256,
          errorMessage: null,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(automaticBackupRuns.id, run.id));
      await tx
        .update(userSettings)
        .set({
          lastAutomaticBackupAt: now,
          lastBackupStatus: "completed",
          lastBackupError: null,
          updatedAt: new Date(),
        })
        .where(eq(userSettings.userId, schedule.userId));
    });
    return { status: "completed" as const, ...result };
  } catch (error) {
    const message = safeErrorMessage(error);
    await db.transaction(async (tx) => {
      await tx
        .update(automaticBackupRuns)
        .set({ status: "failed", errorMessage: message, completedAt: new Date(), updatedAt: new Date() })
        .where(eq(automaticBackupRuns.id, run.id));
      await tx
        .update(userSettings)
        .set({ lastBackupStatus: "failed", lastBackupError: message, updatedAt: new Date() })
        .where(eq(userSettings.userId, schedule.userId));
    });
    throw error;
  }
}

export function isAutomaticBackupDue(schedule: BackupSchedule, now: Date) {
  if (!schedule.enabled || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.window)) return false;
  const current = getZonedDateAndTime(now, schedule.timeZone);
  if (current.time < schedule.window) return false;
  if (!schedule.lastBackupAt) return true;
  return getZonedDateAndTime(schedule.lastBackupAt, schedule.timeZone).date !== current.date;
}

async function readBackupSchedule(): Promise<BackupSchedule | null> {
  const [row] = await db
    .select({
      userId: users.id,
      enabled: userSettings.autoBackupEnabled,
      window: userSettings.backupWindow,
      retentionCount: userSettings.backupRetentionCount,
      timeZone: userSettings.timeZone,
      lastBackupAt: userSettings.lastAutomaticBackupAt,
    })
    .from(users)
    .innerJoin(userSettings, eq(userSettings.userId, users.id))
    .where(and(eq(users.role, "admin"), eq(userSettings.autoBackupEnabled, true)))
    .orderBy(asc(users.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    userId: row.userId,
    enabled: row.enabled,
    window: row.window,
    retentionCount: Math.min(90, Math.max(2, row.retentionCount)),
    timeZone: row.timeZone,
    lastBackupAt: row.lastBackupAt,
  };
}

async function claimBackupRun(userId: string, scheduledDate: string, now: Date) {
  const [created] = await db
    .insert(automaticBackupRuns)
    .values({ id: crypto.randomUUID(), ownerUserId: userId, scheduledDate, status: "running", startedAt: now, updatedAt: now })
    .onConflictDoNothing()
    .returning({ id: automaticBackupRuns.id });
  if (created) return created;

  const retryCutoff = new Date(now.getTime() - BACKUP_RETRY_DELAY_MS);
  const staleRunCutoff = new Date(now.getTime() - STALE_BACKUP_RUN_MS);
  const [retried] = await db
    .update(automaticBackupRuns)
    .set({
      status: "running",
      attempts: sql`${automaticBackupRuns.attempts} + 1`,
      errorMessage: null,
      startedAt: now,
      completedAt: null,
      updatedAt: now,
    })
    .where(and(
      eq(automaticBackupRuns.scheduledDate, scheduledDate),
      lt(automaticBackupRuns.attempts, MAX_BACKUP_ATTEMPTS),
      or(
        and(eq(automaticBackupRuns.status, "failed"), lt(automaticBackupRuns.updatedAt, retryCutoff)),
        and(eq(automaticBackupRuns.status, "running"), lt(automaticBackupRuns.updatedAt, staleRunCutoff))
      )
    ))
    .returning({ id: automaticBackupRuns.id });
  return retried ?? null;
}

async function createVerifiedBackup(scheduledDate: string, retentionCount: number, now: Date) {
  const directory = path.resolve(env.automaticBackupDirectory);
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const fileName = `sentrovia-db-${scheduledDate}T${stamp.slice(9)}.sentrovia-backup`;
  const dumpPath = path.join(directory, `.sentrovia-${crypto.randomUUID()}.dump`);
  const verificationPath = path.join(directory, `.sentrovia-${crypto.randomUUID()}.verify.dump`);
  const backupPath = path.join(directory, fileName);

  try {
    await createPostgresDump(dumpPath);
    await assertPostgresDump(dumpPath);
    await encryptDatabaseDump(dumpPath, backupPath, getAppEncryptionSecret());
    await decryptDatabaseBackup(backupPath, verificationPath, getAppEncryptionSecret());
    await verifyPostgresDump(verificationPath);
    const [stats, checksumSha256] = await Promise.all([
      fs.promises.stat(backupPath),
      calculateFileSha256(backupPath),
    ]);
    await rotateBackups(directory, retentionCount);
    return { fileName, sizeBytes: stats.size, checksumSha256 };
  } catch (error) {
    await fs.promises.rm(backupPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await Promise.all([
      fs.promises.rm(dumpPath, { force: true }),
      fs.promises.rm(verificationPath, { force: true }),
    ]);
  }
}

async function createPostgresDump(outputPath: string) {
  const connection = buildPostgresCommandEnvironment(getDatabaseUrl());
  await runPostgresCommand(env.pgDumpPath, [
    ...connection.args,
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--file", outputPath,
  ], connection.environment, "pg_dump");
}

async function verifyPostgresDump(dumpPath: string) {
  await assertPostgresDump(dumpPath);
  await runPostgresCommand(env.pgRestorePath, ["--list", dumpPath], process.env, "pg_restore verification");
}

async function assertPostgresDump(filePath: string) {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const header = Buffer.alloc(DUMP_MAGIC.length);
    const result = await handle.read(header, 0, header.length, 0);
    if (result.bytesRead !== DUMP_MAGIC.length || !header.equals(DUMP_MAGIC)) {
      throw new Error("pg_dump did not produce a valid PostgreSQL custom-format archive.");
    }
  } finally {
    await handle.close();
  }
}

async function rotateBackups(directory: string, retentionCount: number) {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries
    .filter((entry) => entry.isFile() && BACKUP_FILE_PATTERN.test(entry.name))
    .map(async (entry) => ({
      path: path.join(directory, entry.name),
      modifiedAt: (await fs.promises.stat(path.join(directory, entry.name))).mtimeMs,
    })));
  files.sort((left, right) => right.modifiedAt - left.modifiedAt);
  await Promise.all(files.slice(retentionCount).map((file) => fs.promises.rm(file.path, { force: true })));
}

async function markBackupSettings(userId: string, status: "running" | "failed" | "completed", error: string | null) {
  await db
    .update(userSettings)
    .set({ lastBackupStatus: status, lastBackupError: error, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId));
}

function getZonedDateAndTime(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Automatic backup failed.";
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database-url-redacted]").slice(0, MAX_BACKUP_ERROR_LENGTH);
}
