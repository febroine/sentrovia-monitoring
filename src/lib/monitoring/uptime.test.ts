import { describe, expect, it } from "vitest";
import { formatMonitorUptime } from "@/lib/monitoring/uptime";

describe("formatMonitorUptime", () => {
  it("does not fabricate an uptime percentage without completed checks", () => {
    expect(formatMonitorUptime()).toBe("No data");
    expect(formatMonitorUptime({ hasData: false, uptimePct: 0 })).toBe("No data");
  });

  it("formats duration-based availability", () => {
    expect(formatMonitorUptime({ hasData: true, uptimePct: 99.5 })).toBe("99.50%");
    expect(formatMonitorUptime({ hasData: true, uptimePct: 0 })).toBe("0.00%");
  });
});
