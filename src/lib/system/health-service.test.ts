import { describe, expect, it } from "vitest";
import {
  buildSystemHealthAlarms,
  isSystemMonitorDelayed,
} from "@/lib/system/health-service";

describe("buildSystemHealthAlarms", () => {
  it("returns no alarms for a healthy idle system", () => {
    expect(buildSystemHealthAlarms({
      workerDesiredState: "running",
      workerHealthy: true,
      heartbeatAgeMs: 1_000,
      connectivityStatus: "online",
      connectivityMessage: null,
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
      connectivityStatus: "online",
      connectivityMessage: null,
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
      connectivityStatus: "offline",
      connectivityMessage: "Internet is unavailable.",
      delayedMonitorCount: 0,
      failedDeliveryCount: 0,
      queuedDeliveryCount: 0,
    })).toEqual([]);
  });

  it("reports connectivity loss once and suppresses the expected delayed-check alarm", () => {
    const alarms = buildSystemHealthAlarms({
      workerDesiredState: "running",
      workerHealthy: true,
      heartbeatAgeMs: 1_000,
      connectivityStatus: "offline",
      connectivityMessage: "Monitoring is paused while all canaries are unavailable.",
      delayedMonitorCount: 25,
      failedDeliveryCount: 0,
      queuedDeliveryCount: 0,
    });

    expect(alarms).toEqual([{
      id: "worker-connectivity-offline",
      severity: "critical",
      title: "Internet connectivity is unavailable",
      detail: "Monitoring is paused while all canaries are unavailable.",
    }]);
  });
});

describe("isSystemMonitorDelayed", () => {
  it("does not report a delay while a long-running check is within its timeout grace", () => {
    const monitor = {
      lastCheckedAt: new Date("2026-08-20T11:58:00.000Z"),
      nextCheckAt: new Date("2026-08-20T11:59:00.000Z"),
      intervalValue: 1,
      intervalUnit: "minutes" as const,
      timeout: 120_000,
    };

    expect(isSystemMonitorDelayed(monitor, new Date("2026-08-20T12:00:30.000Z"))).toBe(false);
    expect(isSystemMonitorDelayed(monitor, new Date("2026-08-20T12:01:00.001Z"))).toBe(true);
  });
});
