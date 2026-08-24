import { describe, expect, it } from "vitest";
import {
  buildPostgresCommandEnvironment,
  isAutomaticBackupDue,
} from "@/lib/system/automatic-backup";

const baseSchedule = {
  userId: "admin-1",
  enabled: true,
  window: "03:00",
  retentionCount: 7,
  timeZone: "Europe/Istanbul",
  lastBackupAt: null,
};

describe("automatic database backup scheduling", () => {
  it("runs once after the configured local-time window", () => {
    expect(isAutomaticBackupDue(baseSchedule, new Date("2026-08-24T00:01:00.000Z"))).toBe(true);
    expect(isAutomaticBackupDue(baseSchedule, new Date("2026-08-23T23:59:00.000Z"))).toBe(false);
    expect(isAutomaticBackupDue({
      ...baseSchedule,
      lastBackupAt: new Date("2026-08-24T00:05:00.000Z"),
    }, new Date("2026-08-24T10:00:00.000Z"))).toBe(false);
  });

  it("runs again when the configured timezone reaches the next calendar day", () => {
    expect(isAutomaticBackupDue({
      ...baseSchedule,
      lastBackupAt: new Date("2026-08-24T00:05:00.000Z"),
    }, new Date("2026-08-25T00:05:00.000Z"))).toBe(true);
  });

  it("does not run disabled or malformed schedules", () => {
    expect(isAutomaticBackupDue({ ...baseSchedule, enabled: false }, new Date("2026-08-24T10:00:00Z"))).toBe(false);
    expect(isAutomaticBackupDue({ ...baseSchedule, window: "3am" }, new Date("2026-08-24T10:00:00Z"))).toBe(false);
  });
});

describe("PostgreSQL backup command configuration", () => {
  it("keeps credentials out of command arguments", () => {
    const result = buildPostgresCommandEnvironment(
      "postgresql://backup-user:super-secret@db.example.com:5433/sentrovia?sslmode=require"
    );

    expect(result.args).toEqual([
      "--host", "db.example.com",
      "--port", "5433",
      "--username", "backup-user",
      "--dbname", "sentrovia",
    ]);
    expect(result.args.join(" ")).not.toContain("super-secret");
    expect(result.environment.PGPASSWORD).toBe("super-secret");
    expect(result.environment.PGSSLMODE).toBe("require");
  });

  it("rejects incomplete or non-PostgreSQL URLs", () => {
    expect(() => buildPostgresCommandEnvironment("https://example.com/database")).toThrow(/postgres protocol/);
    expect(() => buildPostgresCommandEnvironment("postgresql://localhost/")).toThrow(/missing/);
  });
});
