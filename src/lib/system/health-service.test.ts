import { describe, expect, it } from "vitest";
import { buildSystemHealthAlarms } from "@/lib/system/health-service";

describe("buildSystemHealthAlarms", () => {
  it("returns no alarms for a healthy idle system", () => {
    expect(buildSystemHealthAlarms({
      workerDesiredState: "running",
      workerHealthy: true,
      heartbeatAgeMs: 1_000,
      delayedMonitorCount: 0,
      failedDeliveryCount: 0,
      queuedDeliveryCount: 0,
    })).toEqual([]);
  });

  it("classifies worker and large check delays as critical", () => {
    const alarms = buildSystemHealthAlarms({
      workerDesiredState: "running",
      workerHealthy: false,
      heartbeatAgeMs: 240_000,
      delayedMonitorCount: 12,
      failedDeliveryCount: 2,
      queuedDeliveryCount: 1,
    });

    expect(alarms.filter((alarm) => alarm.severity === "critical")).toHaveLength(2);
    expect(alarms.map((alarm) => alarm.id)).toEqual([
      "worker-unhealthy",
      "checks-delayed",
      "delivery-failures",
      "delivery-queued",
    ]);
  });

  it("does not alarm when a worker is intentionally stopped", () => {
    expect(buildSystemHealthAlarms({
      workerDesiredState: "stopped",
      workerHealthy: false,
      heartbeatAgeMs: null,
      delayedMonitorCount: 0,
      failedDeliveryCount: 0,
      queuedDeliveryCount: 0,
    })).toEqual([]);
  });
});
