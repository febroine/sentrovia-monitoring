import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: mocks.transaction,
  },
}));

import {
  getSoftDeleteCutoff,
  runRetentionCleanup,
  shouldRunRetentionCleanup,
} from "@/lib/data-retention/service";

describe("retention cleanup scheduling", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");

  it("runs when cleanup has never completed", () => {
    expect(shouldRunRetentionCleanup(null, now)).toBe(true);
  });

  it("waits until one hour has elapsed", () => {
    expect(shouldRunRetentionCleanup(new Date("2026-07-16T11:30:00.000Z"), now)).toBe(false);
    expect(shouldRunRetentionCleanup(new Date("2026-07-16T11:00:00.000Z"), now)).toBe(true);
  });

  it("uses an absolute cutoff for expired soft deletes", () => {
    expect(getSoftDeleteCutoff(now)).toEqual(new Date("2026-07-16T11:59:00.000Z"));
  });
});

describe("workspace retention policy cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockImplementation(async () => (
      mocks.execute.mock.calls.length === 1 ? [{ acquired: true }] : []
    ));
    mocks.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(async () => [{ lastRetentionCleanupAt: null }]),
      })),
    });
    mocks.update.mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn(async () => []) })),
    });
    mocks.transaction.mockImplementation(async (callback) => callback({
      execute: mocks.execute,
      select: mocks.select,
      update: mocks.update,
    }));
  });

  it("uses workspace settings for mixed-member records and legacy settings only when no workspace row exists", async () => {
    await runRetentionCleanup(new Date("2026-09-12T12:00:00.000Z"));

    const dialect = new PgDialect();
    const cleanupQueries = mocks.execute.mock.calls
      .map(([query]) => dialect.sqlToQuery(query))
      .filter(({ sql }) => /delete from (monitor_checks|monitor_events|monitor_diagnostics|outage_events|monitor_outages|delivery_events|audit_events) as record/.test(sql));

    expect(cleanupQueries).toHaveLength(7);
    for (const query of cleanupQueries) {
      expect(query.sql).toContain("case\n    when exists");
      expect(query.sql).toContain('from "workspace_settings"');
      expect(query.sql).toContain('"workspace_settings"."workspace_id" = record.workspace_id');
      expect(query.sql).toContain("else coalesce");
      expect(query.sql).toContain('from "user_settings"');
      expect(query.sql).toContain('"user_settings"."user_id" = record.user_id');
    }

    const checkRetention = cleanupQueries.find(({ sql }) => sql.includes("delete from monitor_checks"));
    expect(checkRetention?.params).toEqual(expect.arrayContaining([
      "dataRetentionDays",
      "data_retention_days",
    ]));

    const deliveryRetention = cleanupQueries.find(({ sql }) => sql.includes("delete from delivery_events"));
    expect(deliveryRetention?.params).toEqual(expect.arrayContaining([
      "deliveryRetentionDays",
      "delivery_retention_days",
    ]));
  });
});
