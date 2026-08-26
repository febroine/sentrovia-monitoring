import { describe, expect, it } from "vitest";
import { formatMonitorUptime } from "@/lib/monitoring/uptime";

describe("formatMonitorUptime", () => {
  it("does not fabricate an uptime percentage without completed checks", () => {
    expect(formatMonitorUptime()).toBe("No data");
    expect(formatMonitorUptime({ totalChecks: 0, upChecks: 0 })).toBe("No data");
  });

  it("calculates and bounds the completed-check uptime", () => {
    expect(formatMonitorUptime({ totalChecks: 100, upChecks: 99 })).toBe("99.00%");
    expect(formatMonitorUptime({ totalChecks: 10, upChecks: 12 })).toBe("100.00%");
    expect(formatMonitorUptime({ totalChecks: 10, upChecks: -2 })).toBe("0.00%");
  });
});
