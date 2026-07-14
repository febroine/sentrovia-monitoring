import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";
import postgres from "postgres";

const { loadEnvConfig } = nextEnv;
const mode = process.argv[2];
const MAX_DB_ATTEMPTS = 30;
const RETRY_DELAY_MS = 2_000;
const PROJECT_ROOT = process.cwd();
const DATABASE_SYNC_SCRIPT = path.join(PROJECT_ROOT, "scripts", "sync-database-schema.mjs");
const NEXT_CLI = path.join(PROJECT_ROOT, "node_modules", "next", "dist", "bin", "next");
const TSX_CLI = path.join(PROJECT_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const WORKER_ENTRY = path.join(PROJECT_ROOT, "src", "worker", "runner.ts");

loadEnvConfig(process.cwd());

if (!mode || !["web", "worker"].includes(mode)) {
  console.error("Usage: node scripts/bootstrap-runtime.mjs <web|worker>");
  process.exit(1);
}

const DATABASE_URL = resolveDatabaseUrl();

if (!DATABASE_URL) {
  console.error(
    "Database connection is not configured. Set DATABASE_URL or POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB in .env.local."
  );
  process.exit(1);
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

  if (user && password && database) {
    return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  }

  return null;
}

await waitForDatabase(DATABASE_URL);

if (mode === "web") {
  await runStep(process.execPath, [DATABASE_SYNC_SCRIPT], "Synchronizing database schema");
  runForeground(process.execPath, [NEXT_CLI, "start"]);
} else {
  runForeground(process.execPath, [TSX_CLI, WORKER_ENTRY]);
}

async function waitForDatabase(connectionString) {
  for (let attempt = 1; attempt <= MAX_DB_ATTEMPTS; attempt += 1) {
    const client = postgres(connectionString, {
      max: 1,
      idle_timeout: 1,
      connect_timeout: 5,
      prepare: false,
    });

    try {
      await client`select 1`;
      await client.end({ timeout: 1 });
      console.log(`Database is ready after ${attempt} attempt(s).`);
      return;
    } catch (error) {
      await client.end({ timeout: 1 }).catch(() => undefined);

      if (attempt === MAX_DB_ATTEMPTS) {
        console.error("Database did not become ready in time.");
        console.error(error instanceof Error ? error.message : "Unknown database error");
        process.exit(1);
      }

      console.log(`Waiting for PostgreSQL... attempt ${attempt}/${MAX_DB_ATTEMPTS}`);
      await delay(RETRY_DELAY_MS);
    }
  }
}

function runStep(command, args, label) {
  console.log(`${label}...`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      env: process.env,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${label} failed with exit code ${code ?? "unknown"}.`));
    });
    child.on("error", reject);
  });
}

function runForeground(command, args) {
  let shutdownRequested = false;
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });

  const forwardSignal = (signal) => {
    shutdownRequested = true;
    if (child.exitCode === null && !child.killed) {
      child.kill(signal);
    }
  };
  const handleSigint = () => forwardSignal("SIGINT");
  const handleSigterm = () => forwardSignal("SIGTERM");
  process.once("SIGINT", handleSigint);
  process.once("SIGTERM", handleSigterm);

  child.on("exit", (code) => {
    process.off("SIGINT", handleSigint);
    process.off("SIGTERM", handleSigterm);
    process.exit(shutdownRequested ? 0 : (code ?? 1));
  });
  child.on("error", (error) => {
    process.off("SIGINT", handleSigint);
    process.off("SIGTERM", handleSigterm);
    console.error(error instanceof Error ? error.message : "Unable to start runtime.");
    process.exit(1);
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
