import { describe, expect, it } from "vitest";
import { parseOptions, resolveDatabaseUrl } from "./repair-database.mjs";

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
