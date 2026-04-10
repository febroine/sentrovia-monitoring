import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseUrl } from "@/lib/env";
import * as schema from "@/lib/db/schema";

const globalForDatabase = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};

const connection =
  globalForDatabase.sql ??
  postgres(getDatabaseUrl(), {
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.sql = connection;
}

export const sql = connection;
export const db = drizzle(connection, { schema });
