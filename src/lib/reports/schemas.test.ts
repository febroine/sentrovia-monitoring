import { describe, expect, it } from "vitest";
import { reportPreviewSchema, reportSchedulePatchSchema } from "@/lib/reports/schemas";

describe("report schemas", () => {
  it("accepts the outage summary field", () => {
    const parsed = reportPreviewSchema.parse({
      scope: "global",
      cadence: "weekly",
      includeOutageSummary: false,
    });

    expect(parsed.includeOutageSummary).toBe(false);
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
