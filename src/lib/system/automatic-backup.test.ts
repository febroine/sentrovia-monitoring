import { describe, expect, it } from "vitest";
import {
  buildPostgresCommandEnvironment,
  isAutomaticBackupDue,
  resolveWorkspaceBackupSchedule,
} from "@/lib/system/automatic-backup";

const baseSchedule = {
  workspaceId: "workspace-1",
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

  it("treats an explicit workspace disable as authoritative", () => {
    expect(resolveWorkspaceBackupSchedule([{
      workspaceId: "workspace-1",
      userId: "admin-1",
      values: { autoBackupEnabled: false },
      timeZone: "Europe/Istanbul",
    }])).toBeNull();
  });

  it("uses legacy backup settings only when no workspace settings row exists", () => {
    expect(resolveWorkspaceBackupSchedule([])).toBeUndefined();
  });

  it("resolves an enabled workspace backup schedule with legacy JSON keys", () => {
    expect(resolveWorkspaceBackupSchedule([{
      workspaceId: "workspace-1",
      userId: "admin-1",
      values: {
        auto_backup_enabled: true,
        backup_window: "04:30",
        backup_retention_count: 12,
        backup_time_zone: "America/New_York",
        last_automatic_backup_at: "2026-08-24T01:30:00.000Z",
      },
      timeZone: "UTC",
    }])).toEqual({
      workspaceId: "workspace-1",
      userId: "admin-1",
      enabled: true,
      window: "04:30",
      retentionCount: 12,
      timeZone: "America/New_York",
      lastBackupAt: new Date("2026-08-24T01:30:00.000Z"),
    });
  });

  it("keeps the existing admin timezone as a pre-backfill compatibility fallback", () => {
    expect(resolveWorkspaceBackupSchedule([{
      workspaceId: "workspace-1",
      userId: "admin-1",
      values: { autoBackupEnabled: true, backupWindow: "05:00" },
      timeZone: "Europe/Istanbul",
    }])).toMatchObject({
      timeZone: "Europe/Istanbul",
      window: "05:00",
    });
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
