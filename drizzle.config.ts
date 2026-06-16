import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.POSTGRES_HOST || "localhost";
  const port = process.env.POSTGRES_PORT || "5432";
  const user = process.env.POSTGRES_USER || "postgres";
  const password = process.env.POSTGRES_PASSWORD || "postgres";
  const database = process.env.POSTGRES_DB || "uptimemonitoring";

  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
});
