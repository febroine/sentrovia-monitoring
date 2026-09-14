import { describe, expect, it } from "vitest";
import { REPORT_ANALYTICS_LIMITS } from "@/lib/reports/limits";
import { reportAnalyticsQuerySchema, reportPreviewSchema, reportSchedulePatchSchema } from "@/lib/reports/schemas";

describe("report schemas", () => {
  it("accepts the outage summary field", () => {
    const parsed = reportPreviewSchema.parse({
      scope: "global",
      cadence: "weekly",
      includeOutageSummary: false,
    });

    expect(parsed.includeOutageSummary).toBe(false);
  });

  it("accepts a monitor filter for an on-demand report", () => {
    const parsed = reportPreviewSchema.parse({
      scope: "global",
      cadence: "weekly",
      monitorId: "monitor-42",
    });

    expect(parsed.monitorId).toBe("monitor-42");
  });

  it("accepts bounded analytics exclusions", () => {
    const parsed = reportAnalyticsQuerySchema.parse({
      excludeMonitorIds: ["monitor-1"],
      excludeTags: ["staging"],
      excludeCompanyIds: ["company-1"],
    });

    expect(parsed.excludeMonitorIds).toEqual(["monitor-1"]);
    expect(parsed.excludeTags).toEqual(["staging"]);
    expect(parsed.excludeCompanyIds).toEqual(["company-1"]);
  });

  it("accepts company-scoped multi-monitor analytics", () => {
    const parsed = reportAnalyticsQuerySchema.parse({
      companyId: "company-1",
      monitorIds: ["monitor-1", "monitor-2"],
    });

    expect(parsed.companyId).toBe("company-1");
    expect(parsed.monitorIds).toEqual(["monitor-1", "monitor-2"]);
  });

  it("accepts every monitor allowed in a workspace", () => {
    const monitorIds = Array.from(
      { length: REPORT_ANALYTICS_LIMITS.maxSelectedMonitors },
      (_, index) => `monitor-${index}`
    );

    expect(reportAnalyticsQuerySchema.parse({ monitorIds }).monitorIds)
      .toHaveLength(REPORT_ANALYTICS_LIMITS.maxSelectedMonitors);
    expect(() => reportAnalyticsQuerySchema.parse({ monitorIds: [...monitorIds, "monitor-over-limit"] })).toThrow();
  });

  it("accepts partial schedule updates", () => {
    const parsed = reportSchedulePatchSchema.parse({ includeOutageSummary: false });
    expect(parsed.includeOutageSummary).toBe(false);
  });

  it("rejects non-recurring all-time cadence for report schedules", () => {
    expect(reportSchedulePatchSchema.safeParse({ cadence: "all_time" }).success).toBe(false);
  });

  it("requires ordered boundaries for custom report ranges", () => {
    const base = { scope: "global", cadence: "weekly", periodRange: "custom" } as const;
    expect(reportPreviewSchema.safeParse(base).success).toBe(false);
    expect(reportPreviewSchema.safeParse({
      ...base,
      periodStartedAt: "2026-08-03T00:00:00.000Z",
      periodEndedAt: "2026-08-02T00:00:00.000Z",
      timeZone: "Europe/Istanbul",
    }).success).toBe(false);
    expect(reportPreviewSchema.safeParse({
      ...base,
      periodStartedAt: "2026-08-01T00:00:00.000Z",
      periodEndedAt: "2026-08-02T00:00:00.000Z",
      timeZone: "Europe/Istanbul",
    }).success).toBe(true);
  });
});
