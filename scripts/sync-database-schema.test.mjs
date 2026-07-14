import { describe, expect, it } from "vitest";
import { resolveSchemaSteps } from "./sync-database-schema.mjs";

describe("database schema synchronization order", () => {
  it("creates the base schema before manual migrations for an empty database", () => {
    expect(resolveSchemaSteps({ users: false, monitors: false, user_settings: false })).toEqual([
      "db:push:bootstrap",
      "db:manual",
    ]);
  });

  it("applies manual migrations before schema reconciliation for an existing database", () => {
    expect(resolveSchemaSteps({ users: true, monitors: true, user_settings: true })).toEqual([
      "db:manual",
      "db:push:bootstrap",
    ]);
  });

  it("rejects a partial core schema instead of guessing a destructive order", () => {
    expect(() => resolveSchemaSteps({ users: true, monitors: false, user_settings: true })).toThrow(
      "partial core schema"
    );
  });
});
