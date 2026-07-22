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
});
