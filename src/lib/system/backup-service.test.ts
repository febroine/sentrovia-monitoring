import { describe, expect, it } from "vitest";
import { DEFAULT_MONITOR_FORM, type WorkspaceBackupBundle } from "@/lib/monitors/types";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import { parseWorkspaceBackup, validateWorkspaceBackupBundle } from "@/lib/system/backup-service";

describe("workspace backup validation", () => {
  it("returns a backup validation error for malformed YAML", () => {
    expect(() => parseWorkspaceBackup("settings: [", "yaml")).toThrow("The backup file is invalid.");
  });

  it("rejects PostgreSQL monitors whose password was not included in the backup", () => {
    const bundle = buildBackupBundle({
      monitors: [
        {
          ...DEFAULT_MONITOR_FORM,
          name: "Main database",
          monitorType: "postgres",
          databaseHost: "db.example.com",
          databaseName: "app",
          databaseUsername: "monitor",
          databasePassword: "",
          databasePasswordConfigured: true,
        },
      ],
    });

    expect(() => validateWorkspaceBackupBundle(bundle)).toThrow(
      "PostgreSQL monitor passwords are not included in backups"
    );
  });

  it("rejects SMTP settings whose password was not included in the backup", () => {
    const bundle = buildBackupBundle({
      settings: {
        ...buildSettingsPayload(),
        notifications: {
          ...buildSettingsPayload().notifications,
          smtpPassword: "",
          smtpPasswordConfigured: true,
        },
      },
    });

    expect(() => validateWorkspaceBackupBundle(bundle)).toThrow(
      "SMTP password is not included in workspace backups"
    );
  });

  it("accepts a backup with restorable monitor secrets", () => {
    const bundle = buildBackupBundle({
      monitors: [
        {
          ...DEFAULT_MONITOR_FORM,
          name: "Main database",
          monitorType: "postgres",
          databaseHost: "db.example.com",
          databaseName: "app",
          databaseUsername: "monitor",
          databasePassword: "secret",
          databasePasswordConfigured: true,
        },
      ],
    });

    expect(validateWorkspaceBackupBundle(bundle).monitors).toHaveLength(1);
  });
});

function buildBackupBundle(overrides: Partial<WorkspaceBackupBundle> = {}): WorkspaceBackupBundle {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "sentrovia",
    settings: {
      ...buildSettingsPayload(),
    },
    companies: [],
    monitors: [],
    ...overrides,
  };
}

function buildSettingsPayload() {
  return {
    ...DEFAULT_SETTINGS,
    profile: {
      ...DEFAULT_SETTINGS.profile,
      firstName: "Aykut",
      lastName: "Bayram",
      email: "aykut@example.com",
    },
  };
}
