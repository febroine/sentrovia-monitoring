import { describe, expect, it } from "vitest";
import { calculateSlaPeriod } from "@/lib/monitoring/sla-service";

describe("SLA period calculations", () => {
  it("uses duration-based availability and keeps checks as context", () => {
    expect(calculateSlaPeriod("24h SLA", { hasData: true, uptimePct: 95.83, incidentCount: 1, completedChecks: 100 })).toEqual({
      label: "24h SLA",
      hasData: true,
      uptimePct: 95.83,
      outages: 1,
      totalChecks: 100,
    });
  });

  it("marks an empty period as unavailable instead of fully healthy", () => {
    expect(calculateSlaPeriod("7d SLA")).toMatchObject({
      hasData: false,
      uptimePct: 0,
      totalChecks: 0,
    });
  });

  it("does not present incomplete outage history as healthy uptime", () => {
    expect(calculateSlaPeriod("24h SLA", { hasData: false, uptimePct: 100, incidentCount: 0, completedChecks: 10 })).toMatchObject({
      hasData: false,
      uptimePct: 0,
      outages: 0,
      totalChecks: 10,
    });
  });
});
