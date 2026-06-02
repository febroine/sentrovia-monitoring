import { describe, expect, it } from "vitest";
import { isMaintenanceWindowActiveForMonitor } from "@/lib/maintenance/service";

describe("maintenance window matching", () => {
  it("matches a selected monitor during a one-time window", () => {
    const window = buildWindow({
      scope: "monitors",
      monitorIds: ["monitor-1"],
      startsAt: new Date("2026-05-10T09:00:00.000Z"),
      endsAt: new Date("2026-05-10T10:00:00.000Z"),
    });

    expect(
      isMaintenanceWindowActiveForMonitor(
        window,
        { id: "monitor-1", companyId: null, tags: [] },
        new Date("2026-05-10T09:30:00.000Z")
      )
    ).toBe(true);
  });

  it("uses the configured timezone for weekly recurring windows", () => {
    const window = buildWindow({
      recurrence: "weekly",
      timezone: "Europe/Istanbul",
      startsAt: new Date("2026-05-11T06:00:00.000Z"),
      endsAt: new Date("2026-05-11T07:00:00.000Z"),
    });

    expect(
      isMaintenanceWindowActiveForMonitor(
        window,
        { id: "monitor-1", companyId: null, tags: [] },
        new Date("2026-05-18T06:30:00.000Z")
      )
    ).toBe(true);
  });

  it("matches tags case-insensitively", () => {
    const window = buildWindow({ scope: "tags", tags: ["ERP"] });

    expect(
      isMaintenanceWindowActiveForMonitor(
        window,
        { id: "monitor-1", companyId: null, tags: ["erp"] },
        new Date("2026-05-10T09:30:00.000Z")
      )
    ).toBe(true);
  });
});

function buildWindow(overrides: Partial<Record<string, unknown>>) {
  return {
    id: "window-1",
    userId: "user-1",
    name: "Patch window",
    startsAt: new Date("2026-05-10T09:00:00.000Z"),
    endsAt: new Date("2026-05-10T10:00:00.000Z"),
    timezone: "Europe/Istanbul",
    recurrence: "none",
    scope: "all",
    monitorIds: [],
    companyIds: [],
    tags: [],
    isActive: true,
    suppressNotifications: true,
    suppressChecks: false,
    reason: "",
    createdAt: new Date("2026-05-10T08:00:00.000Z"),
    updatedAt: new Date("2026-05-10T08:00:00.000Z"),
    ...overrides,
  } as Parameters<typeof isMaintenanceWindowActiveForMonitor>[0];
}
