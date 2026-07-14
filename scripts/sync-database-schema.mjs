import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import postgres from "postgres";

const { loadEnvConfig } = nextEnv;
const CORE_TABLES = ["users", "monitors", "user_settings"];
const SCHEMA_LOCK_KEYS = [728551, 493028];
const SCHEMA_LOCK_ATTEMPTS = 150;
const SCHEMA_LOCK_RETRY_MS = 2_000;
const PROJECT_ROOT = process.cwd();
const MANUAL_MIGRATION_SCRIPT = path.join(PROJECT_ROOT, "scripts", "apply-manual-migrations.mjs");
const DRIZZLE_KIT_CLI = path.join(PROJECT_ROOT, "node_modules", "drizzle-kit", "bin.cjs");

export function resolveSchemaSteps(tablePresence) {
  const states = CORE_TABLES.map((table) => Boolean(tablePresence[table]));
  if (states.every((present) => !present)) {
    return ["db:push:bootstrap", "db:manual"];
  }
  if (states.every(Boolean)) {
    return ["db:manual", "db:push:bootstrap"];
  }

  const presentTables = CORE_TABLES.filter((table) => tablePresence[table]);
  const missingTables = CORE_TABLES.filter((table) => !tablePresence[table]);
  throw new Error(
    `Database has a partial core schema. Present: ${presentTables.join(", ") || "none"}; missing: ${missingTables.join(", ")}.`
  );
}

async function main() {
  loadEnvConfig(process.cwd());
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("Database connection is not configured.");
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  let lockAcquired = false;
  try {
    await acquireSchemaLock(sql);
    lockAcquired = true;

    const tablePresence = await readCoreTablePresence(sql);
    const steps = resolveSchemaSteps(tablePresence);
    console.log(`Database schema plan: ${steps.join(" -> ")}`);

    for (const step of steps) {
      await runSchemaStep(step);
    }
  } finally {
    if (lockAcquired) {
      await releaseSchemaLock(sql);
    }
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
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

async function acquireSchemaLock(sql) {
  for (let attempt = 1; attempt <= SCHEMA_LOCK_ATTEMPTS; attempt += 1) {
    const rows = await sql`
      SELECT pg_try_advisory_lock(${SCHEMA_LOCK_KEYS[0]}, ${SCHEMA_LOCK_KEYS[1]}) AS acquired
    `;
    if (rows[0]?.acquired) {
      return;
    }

    if (attempt === 1) {
      console.log("Another database schema synchronization is running; waiting for it to finish...");
    }
    await delay(SCHEMA_LOCK_RETRY_MS);
  }

  throw new Error("Timed out waiting for the database schema synchronization lock.");
}

async function releaseSchemaLock(sql) {
  await sql`
    SELECT pg_advisory_unlock(${SCHEMA_LOCK_KEYS[0]}, ${SCHEMA_LOCK_KEYS[1]})
  `.catch(() => undefined);
}

async function readCoreTablePresence(sql) {
  const rows = await sql`
    SELECT
      to_regclass('public.users') IS NOT NULL AS users,
      to_regclass('public.monitors') IS NOT NULL AS monitors,
      to_regclass('public.user_settings') IS NOT NULL AS user_settings
  `;
  return rows[0];
}

function runSchemaStep(step) {
  const args = step === "db:manual"
    ? [MANUAL_MIGRATION_SCRIPT]
    : [DRIZZLE_KIT_CLI, "push", "--force"];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${step} failed with exit code ${code ?? "unknown"}.`));
    });
    child.on("error", reject);
  });
}

function isMainModule() {
  return Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Database schema synchronization failed.");
    process.exitCode = 1;
  });
}
