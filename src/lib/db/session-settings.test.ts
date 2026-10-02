import { describe, expect, it } from "vitest";
import { resolveDatabaseSessionSettings, WORKER_PROCESS_ROLE } from "@/lib/db/session-settings";

describe("database session settings", () => {
  it("gives worker sessions lock and statement timeouts", () => {
    expect(resolveDatabaseSessionSettings(WORKER_PROCESS_ROLE)).toEqual({
      statement_timeout: 300_000,
      lock_timeout: 60_000,
    });
  });

  it("leaves web app sessions unchanged", () => {
    expect(resolveDatabaseSessionSettings(undefined)).toBeUndefined();
  });
});
