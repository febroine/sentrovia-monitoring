import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";
import postgres from "postgres";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const databaseUrl = resolveDatabaseUrl();
const migrationsDir = path.join(process.cwd(), "drizzle");

if (!databaseUrl) {
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

if (!fs.existsSync(migrationsDir)) {
  console.error(`Migration directory was not found: ${migrationsDir}`);
  process.exit(1);
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith("_manual.sql"))
  .sort();

if (files.length === 0) {
  console.log("No manual migrations found.");
  process.exit(0);
}

const db = postgres(databaseUrl, { max: 1, prepare: false });

try {
  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const query = fs.readFileSync(fullPath, "utf8").trim();

    if (!query) {
      console.log(`${file} skipped: empty migration`);
      continue;
    }

    await db.unsafe(query);
    console.log(`${file} applied`);
  }

  console.log("Manual migrations applied.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Manual migration failed.");
  process.exitCode = 1;
} finally {
  await db.end().catch(() => undefined);
}
