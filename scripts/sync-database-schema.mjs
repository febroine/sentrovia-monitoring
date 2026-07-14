import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import postgres from "postgres";

const { loadEnvConfig } = nextEnv;
const CORE_TABLES = ["users", "monitors", "user_settings"];

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

  const tablePresence = await readCoreTablePresence(databaseUrl);
  const steps = resolveSchemaSteps(tablePresence);
  console.log(`Database schema plan: ${steps.join(" -> ")}`);

  for (const step of steps) {
    await runNpmScript(step);
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

async function readCoreTablePresence(databaseUrl) {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const rows = await sql`
      SELECT
        to_regclass('public.users') IS NOT NULL AS users,
        to_regclass('public.monitors') IS NOT NULL AS monitors,
        to_regclass('public.user_settings') IS NOT NULL AS user_settings
    `;
    return rows[0];
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}

function runNpmScript(script) {
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
  const args = npmCli ? [npmCli, "run", script] : ["run", script];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      shell: !npmCli && process.platform === "win32",
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${script} failed with exit code ${code ?? "unknown"}.`));
    });
    child.on("error", reject);
  });
}

function isMainModule() {
  return Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Database schema synchronization failed.");
    process.exitCode = 1;
  });
}
