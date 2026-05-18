import { describe, expect, it } from "vitest";
import { DEFAULT_MONITOR_FORM, type WorkspaceBackupBundle } from "@/lib/monitors/types";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import {
  buildCompanyIdByName,
  parseWorkspaceBackup,
  resolveRestoredCompanyId,
  validateWorkspaceBackupBundle,
} from "@/lib/system/backup-service";

describe("workspace backup validation", () => {
  it("returns a backup validation error for malformed YAML", () => {
    expect(() => parseWorkspaceBackup("settings: [", "yaml")).toThrow("The backup file is invalid.");
  });

  it("rejects oversized workspace backup bundles before parsing", () => {
    const raw = JSON.stringify({
      ...buildBackupBundle(),
      monitors: [
        {
          ...DEFAULT_MONITOR_FORM,
          name: "Large monitor",
          url: `https://example.com/${"x".repeat(1_500_000)}`,
        },
      ],
    });

    expect(() => parseWorkspaceBackup(raw, "json")).toThrow(
      "The uploaded backup file is too large."
    );
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

  it("rejects workspace backups with too many companies", () => {
    const bundle = buildBackupBundle({
      companies: Array.from({ length: 201 }, (_, index) => ({
        name: `Company ${index}`,
        description: "",
        isActive: true,
      })),
    });

    expect(() => validateWorkspaceBackupBundle(bundle)).toThrow(
      "Restore at most 200 companies at a time."
    );
  });

  it("rejects workspace backups with too many monitors", () => {
    const bundle = buildBackupBundle({
      monitors: Array.from({ length: 501 }, (_, index) => ({
        ...DEFAULT_MONITOR_FORM,
        name: `Monitor ${index}`,
        url: `https://example-${index}.com`,
      })),
    });

    expect(() => validateWorkspaceBackupBundle(bundle)).toThrow(
      "Restore at most 500 monitors at a time."
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

  it("resolves restored monitor companies case-insensitively", () => {
    const companyIdByName = buildCompanyIdByName([{ id: "company-1", name: "ACME Operations" }]);

    expect(resolveRestoredCompanyId(" acme operations ", companyIdByName)).toBe("company-1");
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
