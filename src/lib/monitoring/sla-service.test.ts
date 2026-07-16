import { describe, expect, it } from "vitest";
import { calculateSlaPeriod } from "@/lib/monitoring/sla-service";

describe("SLA period calculations", () => {
  it("calculates uptime from all settled checks", () => {
    expect(calculateSlaPeriod("24h SLA", 90, 10, 100)).toEqual({
      label: "24h SLA",
      uptimePct: 90,
      outages: 10,
      totalChecks: 100,
    });
  });

  it("treats an empty period as fully available", () => {
    expect(calculateSlaPeriod("7d SLA", 0, 0, 0).uptimePct).toBe(100);
  });

  it("bounds inconsistent check counts while preserving the independent outage count", () => {
    expect(calculateSlaPeriod("24h SLA", 12, 14, 10)).toMatchObject({
      uptimePct: 100,
      outages: 14,
      totalChecks: 10,
    });
  });
});
