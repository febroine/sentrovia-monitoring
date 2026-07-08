import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";
import postgres from "postgres";

const { loadEnvConfig } = nextEnv;

const MIGRATION_SUFFIX = "_manual.sql";
const ADVISORY_LOCK_KEYS = [728551, 493027];

loadEnvConfig(process.cwd());

const options = parseOptions(process.argv.slice(2));
const databaseUrl = resolveDatabaseUrl();
const migrationsDir = path.join(process.cwd(), "drizzle");

if (!databaseUrl) {
  console.error(
    "Database connection is not configured. Set DATABASE_URL or POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB in .env.local."
  );
  process.exit(1);
}

if (!fs.existsSync(migrationsDir)) {
  console.error(`Migration directory was not found: ${migrationsDir}`);
  process.exit(1);
}

const migrations = listManualMigrations(migrationsDir);

if (migrations.length === 0) {
  console.log("No manual migrations found.");
  process.exit(0);
}

const db = postgres(databaseUrl, { max: 1, prepare: false });

try {
  const hasMigrationTable = await prepareMigrationTable(db, options);
  const result = await applyMigrations(db, migrations, options, hasMigrationTable);
  printSummary(result, options);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Manual migration failed.");
  process.exitCode = 1;
} finally {
  await db.end().catch(() => undefined);
}

function parseOptions(args) {
  return {
    baseline: args.includes("--baseline"),
    dryRun: args.includes("--dry-run"),
  };
}

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.POSTGRES_HOST || "localhost";
  const port = process.env.POSTGRES_PORT || "5432";
  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const database = process.env.POSTGRES_DB;

  if (!user || !password || !database) {
    return null;
  }

  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function listManualMigrations(directory) {
  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(MIGRATION_SUFFIX))
    .sort()
    .map((file) => {
      const fullPath = path.join(directory, file);
      const contents = fs.readFileSync(fullPath, "utf8");
      const query = contents.trim();

      return {
        checksum: createChecksum(normalizeMigrationContents(contents)),
        file,
        fullPath,
        query,
      };
    });
}

function createChecksum(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeMigrationContents(value) {
  return value.replace(/\r\n/g, "\n").trim();
}

async function prepareMigrationTable(sql, options) {
  if (!options.dryRun) {
    await ensureMigrationTable(sql);
    return true;
  }

  return migrationTableExists(sql);
}

async function migrationTableExists(sql) {
  const rows = await sql`
    SELECT to_regclass('public.sentrovia_manual_migrations') AS migration_table
  `;

  return Boolean(rows[0]?.migration_table);
}

async function ensureMigrationTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS public.sentrovia_manual_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

async function applyMigrations(sql, migrations, options, hasMigrationTable) {
  const result = { applied: 0, baselined: 0, skipped: 0, empty: 0, pending: 0 };

  for (const migration of migrations) {
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEYS[0]}, ${ADVISORY_LOCK_KEYS[1]})`;
      const existing = hasMigrationTable ? await findExistingMigration(tx, migration.file) : null;

      if (existing) {
        verifyChecksum(migration, existing.checksum);
        result.skipped += 1;
        console.log(`${migration.file} skipped: already applied`);
        return;
      }

      await applyPendingMigration(tx, migration, options, result);
    });
  }

  return result;
}

async function findExistingMigration(sql, filename) {
  const rows = await sql`
    SELECT checksum
    FROM public.sentrovia_manual_migrations
    WHERE filename = ${filename}
    LIMIT 1
  `;

  return rows[0] || null;
}

function verifyChecksum(migration, storedChecksum) {
  if (storedChecksum === migration.checksum) {
    return;
  }

  throw new Error(
    `${migration.file} was already applied, but its checksum changed. Create a new migration file instead of editing an applied migration.`
  );
}

async function applyPendingMigration(sql, migration, options, result) {
  if (options.dryRun) {
    result.pending += 1;
    console.log(`${migration.file} pending${options.baseline ? " for baseline" : ""}`);
    return;
  }

  if (options.baseline) {
    await recordMigration(sql, migration);
    result.baselined += 1;
    console.log(`${migration.file} baselined: marked as applied`);
    return;
  }

  if (!migration.query) {
    await recordMigration(sql, migration);
    result.empty += 1;
    console.log(`${migration.file} skipped: empty migration`);
    return;
  }

  await sql.unsafe(migration.query);
  await recordMigration(sql, migration);
  result.applied += 1;
  console.log(`${migration.file} applied`);
}

async function recordMigration(sql, migration) {
  await sql`
    INSERT INTO public.sentrovia_manual_migrations (filename, checksum)
    VALUES (${migration.file}, ${migration.checksum})
  `;
}

function printSummary(result, options) {
  const mode = options.dryRun ? "Dry run complete" : "Manual migrations complete";
  console.log(
    `${mode}. Applied: ${result.applied}, baselined: ${result.baselined}, skipped: ${result.skipped}, pending: ${result.pending}, empty: ${result.empty}.`
  );
}
