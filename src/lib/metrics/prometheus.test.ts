import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { workerPollIntervalMs: 10_000 },
  getMetricsAuthToken: vi.fn(() => "a".repeat(32)),
}));
vi.mock("@/lib/db", () => ({ db: {} }));

import { getMetricsAuthToken } from "@/lib/env";
import {
  isMetricsRequestAuthorized,
  isWorkerHeartbeatCurrent,
  renderPrometheusMetrics,
} from "@/lib/metrics/prometheus";

describe("Prometheus metrics", () => {
  beforeEach(() => vi.mocked(getMetricsAuthToken).mockReturnValue("a".repeat(32)));

  it("uses constant-length bearer token comparison semantics", () => {
    expect(isMetricsRequestAuthorized(`Bearer ${"a".repeat(32)}`)).toBe(true);
    expect(isMetricsRequestAuthorized(`Bearer ${"b".repeat(32)}`)).toBe(false);
    expect(isMetricsRequestAuthorized(null)).toBe(false);
  });

  it("renders stable metric names and bounded status labels", () => {
    const output = renderPrometheusMetrics({
      workerUp: 1,
      workerDesiredRunning: 1,
      workerHeartbeatAgeSeconds: 2.5,
      lastCycleDurationSeconds: 1.2,
      lastCycleBacklog: 3,
      lastCycleMonitorCount: 20,
      activeMonitors: 25,
      dueMonitors: 5,
      monitorsByStatus: { up: 20, down: 3, pending: 2 },
      deliveriesByStatus: { pending: 1, retrying: 2, processing: 0, delivered: 30, failed: 4 },
      backupStatus: "completed",
      lastBackupSuccessTimestampSeconds: 1_787_500_000,
    });

    expect(output).toContain("sentrovia_worker_up 1");
    expect(output).toContain('sentrovia_monitors_by_status{status="down"} 3');
    expect(output).toContain('sentrovia_automatic_backup_status{status="completed"} 1');
    expect(output).not.toContain("undefined");
  });

  it("never reports a worker as current without a heartbeat", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    expect(isWorkerHeartbeatCurrent(null, now, 180)).toBe(false);
    expect(isWorkerHeartbeatCurrent(new Date("2026-08-24T11:58:00.000Z"), now, 180)).toBe(true);
    expect(isWorkerHeartbeatCurrent(new Date("2026-08-24T11:56:00.000Z"), now, 180)).toBe(false);
    expect(isWorkerHeartbeatCurrent(new Date("2026-08-24T12:04:00.000Z"), now, 180)).toBe(false);
  });
});
