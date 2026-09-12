import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableColumns, SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {}, sql: mocks.sql }));
vi.mock("@/lib/companies/service", () => ({ getCompanyById: vi.fn() }));

import type { DatabaseExecutor } from "@/lib/db";
import { userSettings, workspaceSettings } from "@/lib/db/schema";
import { settingsSchema } from "@/lib/settings/schemas";
import { upsertSettings } from "@/lib/settings/service";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";

const backupProperties = ["autoBackupEnabled", "backupWindow", "backupRetentionCount", "backupTimeZone"];

function persistenceFixture(hasPersonalSettings: boolean) {
  const personalWrite = vi.fn();
  const sharedInsert = vi.fn();
  const sharedConflict = vi.fn();
  const executor = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{
      valuesJson: { auto_backup_enabled: true, backup_window: "03:00", backup_retention_count: 7 },
    }] }) }) }),
    update: () => ({ set: (values: unknown) => {
      personalWrite(values);
      return { where: async () => undefined };
    } }),
    insert: (table: unknown) => ({ values: (values: unknown) => {
      if (table === workspaceSettings) {
        sharedInsert(values);
        return { onConflictDoUpdate: sharedConflict };
      }
      personalWrite(values);
      return Promise.resolve();
    } }),
  } as unknown as DatabaseExecutor;
  mocks.sql.mockImplementation((parts: unknown) => {
    if (!Array.isArray(parts)) return {};
    if (parts.join("").includes("information_schema.columns")) {
      return Promise.resolve(Object.values(getTableColumns(userSettings)).map((column) => ({ column_name: column.name })));
    }
    return Promise.resolve(hasPersonalSettings ? [{ user_id: "operator" }] : []);
  });
  return { executor, personalWrite, sharedInsert, sharedConflict };
}

function input() {
  return settingsSchema.parse({
    ...DEFAULT_SETTINGS,
    profile: { ...DEFAULT_SETTINGS.profile, firstName: "Test", lastName: "User", email: "test@example.com" },
    data: { ...DEFAULT_SETTINGS.data, autoBackupEnabled: false, backupWindow: "12:00", backupRetentionCount: 2 },
  });
}

describe("backup policy persistence authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([true, false])("omits non-admin backup fields from personal and shared writes (existing personal row: %s)", async (hasPersonalSettings) => {
    const fixture = persistenceFixture(hasPersonalSettings);
    await upsertSettings("operator", input(), fixture.executor, true, "workspace", false);

    const personalValues = fixture.personalWrite.mock.calls[0][0];
    const sharedValues = fixture.sharedInsert.mock.calls[0][0].valuesJson;
    for (const property of backupProperties) {
      expect(personalValues).not.toHaveProperty(property);
      expect(sharedValues).not.toHaveProperty(property);
    }
    expect(sharedValues).toHaveProperty("dataRetentionDays", DEFAULT_SETTINGS.data.retentionDays);

    // Compile the actual update expression: the left operand must be the current database row,
    // not a previously read snapshot, and the right operand must omit both key conventions.
    const update = fixture.sharedConflict.mock.calls[0][0].set.valuesJson;
    expect(update).toBeInstanceOf(SQL);
    const query = new PgDialect().sqlToQuery(update);
    expect(query.sql).toBe('coalesce("workspace_settings"."values_json", \'{}\'::jsonb) || $1::jsonb');
    const patch = JSON.parse(query.params[0] as string);
    for (const property of [
      ...backupProperties,
      "auto_backup_enabled",
      "backup_window",
      "backup_retention_count",
      "backup_time_zone",
    ]) {
      expect(patch).not.toHaveProperty(property);
    }
  });

  it("preserves existing trusted admin and restore callers' ability to write backup policy", async () => {
    const fixture = persistenceFixture(true);
    await upsertSettings("admin", input(), fixture.executor, true, "workspace");
    const expectedLegacyPolicy = {
      autoBackupEnabled: false,
      backupWindow: "12:00",
      backupRetentionCount: 2,
    };
    const expectedWorkspacePolicy = {
      ...expectedLegacyPolicy,
      backupTimeZone: DEFAULT_SETTINGS.appearance.timeZone,
    };
    expect(fixture.personalWrite.mock.calls[0][0]).toMatchObject(expectedLegacyPolicy);
    expect(fixture.personalWrite.mock.calls[0][0]).not.toHaveProperty("backupTimeZone");
    expect(fixture.sharedInsert.mock.calls[0][0].valuesJson).toMatchObject(expectedWorkspacePolicy);
    expect(fixture.sharedConflict.mock.calls[0][0].set.valuesJson).toMatchObject(expectedWorkspacePolicy);
  });
});
