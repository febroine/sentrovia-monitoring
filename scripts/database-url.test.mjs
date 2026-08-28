import { describe, expect, it } from "vitest";
import { resolveDatabaseUrl } from "./database-url.mjs";

describe("resolveDatabaseUrl", () => {
  it("prefers and trims DATABASE_URL", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: " postgres://configured/database " }))
      .toBe("postgres://configured/database");
  });

  it("encodes credential and database components", () => {
    expect(resolveDatabaseUrl({
      POSTGRES_USER: "sentrovia user",
      POSTGRES_PASSWORD: "secret/value",
      POSTGRES_DB: "monitoring db",
      POSTGRES_HOST: "database.internal",
      POSTGRES_PORT: "5433",
    })).toBe("postgres://sentrovia%20user:secret%2Fvalue@database.internal:5433/monitoring%20db");
  });

  it("requires complete credentials unless defaults are provided", () => {
    expect(resolveDatabaseUrl({ POSTGRES_PASSWORD: "secret" })).toBeNull();
    expect(resolveDatabaseUrl(
      { POSTGRES_PASSWORD: "secret" },
      { defaultUser: "postgres", defaultDatabase: "uptimemonitoring", protocol: "postgresql" }
    )).toBe("postgresql://postgres:secret@localhost:5432/uptimemonitoring");
  });
});
