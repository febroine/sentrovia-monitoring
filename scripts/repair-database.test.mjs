import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findMissingRequiredTables,
  findUnexpectedTables,
  parseOptions,
  resolveDatabaseUrl,
} from "./repair-database.mjs";

const schemaSource = readFileSync(resolve(import.meta.dirname, "../src/lib/db/schema.ts"), "utf8");

function readSchemaTableNames() {
  return [...schemaSource.matchAll(/pgTable\(\s*["']([^"']+)["']/g)].map((match) => match[1]);
}

describe("database repair options", () => {
  it("supports a rollback-only dry run", () => {
    expect(parseOptions(["--dry-run"])).toEqual({ dryRun: true });
    expect(parseOptions([])).toEqual({ dryRun: false });
  });
});

describe("database repair connection settings", () => {
  it("prefers DATABASE_URL", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: " postgres://configured/database " }))
      .toBe("postgres://configured/database");
  });

  it("builds an encoded URL from PostgreSQL parts", () => {
    expect(resolveDatabaseUrl({
      POSTGRES_HOST: "database.internal",
      POSTGRES_PORT: "5433",
      POSTGRES_USER: "sentrovia user",
      POSTGRES_PASSWORD: "secret/value",
      POSTGRES_DB: "monitoring db",
    })).toBe("postgres://sentrovia%20user:secret%2Fvalue@database.internal:5433/monitoring%20db");
  });

  it("rejects incomplete connection settings", () => {
    expect(resolveDatabaseUrl({ POSTGRES_USER: "postgres" })).toBeNull();
  });
});

describe("database repair schema requirements", () => {
  it("does not require retired operational tables", () => {
    const missing = findMissingRequiredTables([]);

    expect(missing).not.toContain("incident_updates");
    expect(missing).not.toContain("maintenance_windows");
    expect(missing).not.toContain("monitor_incidents");
    expect(missing).toContain("monitors");
  });

  it("recognizes every table defined by the current application schema", () => {
    expect(findUnexpectedTables(readSchemaTableNames())).toEqual([]);
  });
});
