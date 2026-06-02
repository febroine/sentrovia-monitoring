import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";
import postgres from "postgres";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL;
const migrationsDir = path.join(process.cwd(), "drizzle");

if (!databaseUrl) {
  console.error("DATABASE_URL is missing. Manual migrations cannot be applied.");
  process.exit(1);
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
