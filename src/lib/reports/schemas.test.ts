import { describe, expect, it } from "vitest";
import { reportPreviewSchema, reportSchedulePatchSchema } from "@/lib/reports/schemas";

describe("report schema compatibility", () => {
  it("accepts the outage summary field", () => {
    const parsed = reportPreviewSchema.parse({
      scope: "global",
      cadence: "weekly",
      includeOutageSummary: false,
    });

    expect(parsed.includeOutageSummary).toBe(false);
    expect(parsed).not.toHaveProperty("includeIncidentSummary");
  });

  it("maps the retired incident summary field for older clients", () => {
    const parsed = reportSchedulePatchSchema.parse({ includeIncidentSummary: false });

    expect(parsed.includeOutageSummary).toBe(false);
    expect(parsed).not.toHaveProperty("includeIncidentSummary");
  });

  it("prefers the current field when both names are supplied", () => {
    const parsed = reportPreviewSchema.parse({
      scope: "global",
      cadence: "weekly",
      includeOutageSummary: true,
      includeIncidentSummary: false,
    });

    expect(parsed.includeOutageSummary).toBe(true);
  });
});
