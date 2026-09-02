import { describe, expect, it } from "vitest";
import { buildSchemaStepEnvironment, resolveSchemaSteps } from "./sync-database-schema.mjs";

describe("database schema synchronization order", () => {
  it("creates the base schema before manual migrations for an empty database", () => {
    expect(resolveSchemaSteps({ users: false, monitors: false, user_settings: false, audit_events: false })).toEqual([
      "db:push:bootstrap",
      "db:manual:baseline",
    ]);
  });

  it("applies manual migrations before schema reconciliation for an existing database", () => {
    expect(resolveSchemaSteps({ users: true, monitors: true, user_settings: true, audit_events: true })).toEqual([
      "db:manual",
      "db:push:bootstrap",
    ]);
  });

  it("repairs missing manual-migration prerequisites before continuing an existing database", () => {
    expect(resolveSchemaSteps({ users: true, monitors: true, user_settings: true, audit_events: false })).toEqual([
      "db:push:bootstrap",
      "db:manual",
    ]);
  });

  it("rejects a partial core schema instead of guessing a destructive order", () => {
    expect(() => resolveSchemaSteps({ users: true, monitors: false, user_settings: true })).toThrow(
      "partial core schema"
    );
  });

  it("passes the held schema lock to the manual migration child", () => {
    const environment = buildSchemaStepEnvironment("db:manual:baseline", { DATABASE_URL: "postgres://example" });

    expect(environment).toEqual({
      DATABASE_URL: "postgres://example",
      SENTROVIA_SCHEMA_LOCK_HELD: "true",
    });
  });

  it("does not change the environment for the Drizzle push step", () => {
    const environment = { DATABASE_URL: "postgres://example" };

    expect(buildSchemaStepEnvironment("db:push:bootstrap", environment)).toBe(environment);
  });
});
