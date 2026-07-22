import { describe, expect, it } from "vitest";
import { DEFAULT_MONITOR_FORM, type WorkspaceBackupBundle } from "@/lib/monitors/types";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import { settingsSchema } from "@/lib/settings/schemas";
import { encryptValue } from "@/lib/security/encryption";
import {
  buildCompanyIdByName,
  buildWorkspaceRestorePreview,
  parseWorkspaceBackup,
  preparePublicStatusSettingsForBackup,
  resolveRestoredCompanyId,
  remapPublicStatusCompany,
  restorePostgresMonitorPasswords,
  validateWorkspaceBackupBundle,
} from "@/lib/system/backup-service";
import {
  buildWorkspaceRestoreRevision,
  createWorkspaceRestoreToken,
  verifyWorkspaceRestoreToken,
} from "@/lib/system/restore-approval";

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

  it("preserves a matching PostgreSQL monitor password during restore", () => {
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

    const validated = validateWorkspaceBackupBundle(bundle);
    const restored = restorePostgresMonitorPasswords(validated.monitors, [{
      monitorType: "postgres",
      url: "postgres://monitor@db.example.com:5432/app",
      databasePasswordEncrypted: encryptValue("database-secret"),
    }]);

    expect(restored[0].databasePassword).toBe("database-secret");
  });

  it("rejects a redacted PostgreSQL password when no matching secret exists", () => {
    const bundle = buildBackupBundle({
      monitors: [{
        ...DEFAULT_MONITOR_FORM,
        name: "Missing database",
        monitorType: "postgres",
        databaseHost: "missing.example.com",
        databaseName: "app",
        databaseUsername: "monitor",
        databasePassword: "",
        databasePasswordConfigured: true,
      }],
    });

    const validated = validateWorkspaceBackupBundle(bundle);
    expect(() => restorePostgresMonitorPasswords(validated.monitors, [])).toThrow(
      "PostgreSQL monitor passwords are not included in backups"
    );
  });

  it("allows SMTP settings to preserve the existing encrypted password", () => {
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

    expect(validateWorkspaceBackupBundle(bundle).settings.notifications.smtpPasswordConfigured).toBe(true);
  });

  it("rejects workspace backups from an unsupported source or version", () => {
    const bundle = {
      ...buildBackupBundle(),
      version: 2,
      source: "other",
    } as unknown as WorkspaceBackupBundle;

    expect(() => validateWorkspaceBackupBundle(bundle)).toThrow(
      "version or source is not supported"
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

  it("remaps a public status company to its restored id", () => {
    const settings = settingsSchema.parse({
      ...buildSettingsPayload(),
      publicStatus: {
        ...buildSettingsPayload().publicStatus,
        companyId: "00000000-0000-4000-8000-000000000001",
      },
    });

    const remapped = remapPublicStatusCompany(
      settings,
      "ACME Operations",
      buildCompanyIdByName([{ id: "new-company-id", name: "acme operations" }])
    );

    expect(remapped.publicStatus.companyId).toBe("new-company-id");
  });

  it("rejects a scoped public status backup without company metadata", () => {
    const settings = buildSettingsPayload();
    settings.publicStatus.companyId = "00000000-0000-4000-8000-000000000001";

    expect(() => validateWorkspaceBackupBundle(buildBackupBundle({ settings }))).toThrow(
      "missing its public status company scope"
    );
  });

  it("does not broaden an unavailable public status scope during backup", () => {
    const settings = buildSettingsPayload();
    settings.publicStatus.enabled = true;
    settings.publicStatus.companyId = "00000000-0000-4000-8000-000000000001";

    const exported = preparePublicStatusSettingsForBackup(settings, null);

    expect(exported.publicStatus.enabled).toBe(false);
    expect(exported.publicStatus.companyId).toBe("");
  });

  it("describes records that a restore will replace without mutating them", () => {
    const validated = validateWorkspaceBackupBundle(buildBackupBundle({
      companies: [{ name: "Kept company", description: "", isActive: true }],
      monitors: [{ ...DEFAULT_MONITOR_FORM, name: "Incoming", url: "https://kept.example.com" }],
    }));
    const preview = buildWorkspaceRestorePreview(
      validated,
      [{ name: "Kept company" }, { name: "Removed company" }],
      [
        { name: "Kept monitor", monitorType: "http", url: "https://kept.example.com/" },
        { name: "Removed monitor", monitorType: "http", url: "https://removed.example.com/" },
      ],
      [{ companyName: "Kept company" }, { companyName: "Removed company" }]
    );

    expect(preview.current).toEqual({ companies: 2, monitors: 2 });
    expect(preview.incoming).toEqual({ companies: 1, monitors: 1 });
    expect(preview.removedCompanies).toEqual(["Removed company"]);
    expect(preview.removedMonitors).toEqual(["Removed monitor"]);
    expect(preview.reportSchedules).toEqual({ remapped: 1, disabled: 1 });
  });

  it("binds restore approval to the user, exact bundle, and expiration time", () => {
    const issuedAt = new Date("2026-07-16T12:00:00.000Z");
    const token = createWorkspaceRestoreToken("user-1", "json", "backup-content", "revision-1", issuedAt);

    expect(verifyWorkspaceRestoreToken(token, "user-1", "json", "backup-content", "revision-1", issuedAt)).toBe(true);
    expect(verifyWorkspaceRestoreToken(token, "user-2", "json", "backup-content", "revision-1", issuedAt)).toBe(false);
    expect(verifyWorkspaceRestoreToken(token, "user-1", "yaml", "backup-content", "revision-1", issuedAt)).toBe(false);
    expect(verifyWorkspaceRestoreToken(token, "user-1", "json", "changed-content", "revision-1", issuedAt)).toBe(false);
    expect(verifyWorkspaceRestoreToken(token, "user-1", "json", "backup-content", "revision-2", issuedAt)).toBe(false);
    expect(verifyWorkspaceRestoreToken(token, "user-1", "json", "backup-content", "revision-1", new Date(issuedAt.getTime() + 10 * 60_000))).toBe(false);
  });

  it("ignores worker runtime fields but detects configuration changes in restore revisions", () => {
    const base = {
      companies: [],
      monitors: [{ id: "monitor-1", name: "API", status: "up", latencyMs: 100, updatedAt: new Date(1) }],
      settings: null,
      user: null,
    };
    const initial = buildWorkspaceRestoreRevision(base);
    const runtimeChanged = buildWorkspaceRestoreRevision({
      ...base,
      monitors: [{ ...base.monitors[0], status: "down", latencyMs: 5000, updatedAt: new Date(2) }],
    });
    const configChanged = buildWorkspaceRestoreRevision({
      ...base,
      monitors: [{ ...base.monitors[0], name: "Renamed API" }],
    });

    expect(runtimeChanged).toBe(initial);
    expect(configChanged).not.toBe(initial);
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
    publicStatus: {
      ...DEFAULT_SETTINGS.publicStatus,
    },
    profile: {
      ...DEFAULT_SETTINGS.profile,
      firstName: "Aykut",
      lastName: "Bayram",
      email: "aykut@example.com",
    },
  };
}
