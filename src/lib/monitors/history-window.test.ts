import { describe, expect, it } from "vitest";
import { buildMonitorHistoryWindow } from "@/lib/monitors/history-window";
import type { MonitorHistoryPoint } from "@/lib/monitors/types";

describe("monitor history state windows", () => {
  it("uses the latest completed check instead of the current clock for an ongoing window", () => {
    const points = [
      buildPoint("up-1", "up", "2026-09-01T11:20:41.000Z"),
      buildPoint("up-2", "up", "2026-09-01T11:25:41.000Z"),
      buildPoint("up-3", "up", "2026-09-01T11:30:41.000Z"),
      buildPoint("up-4", "up", "2026-09-01T11:35:41.000Z"),
    ];

    const selection = buildMonitorHistoryWindow(points, "up-4");

    expect(selection).toMatchObject({
      isOngoing: true,
      observedDurationMs: 15 * 60_000,
      latestWindowPoint: points[3],
      nextPoint: null,
      windowPoints: points,
    });
  });

  it("ends a historical window at the first completed check with a different state", () => {
    const points = [
      buildPoint("up-1", "up", "2026-09-01T11:00:00.000Z"),
      buildPoint("down-1", "down", "2026-09-01T11:05:00.000Z"),
      buildPoint("down-2", "down", "2026-09-01T11:10:00.000Z"),
      buildPoint("up-2", "up", "2026-09-01T11:15:00.000Z"),
    ];

    const selection = buildMonitorHistoryWindow(points, "down-1");

    expect(selection).toMatchObject({
      isOngoing: false,
      observedDurationMs: 10 * 60_000,
      previousPoint: points[0],
      latestWindowPoint: points[2],
      nextPoint: points[3],
      windowPoints: points.slice(1, 3),
    });
  });

  it("returns null when the selected check is not in the loaded timeline", () => {
    expect(buildMonitorHistoryWindow([], "missing")).toBeNull();
  });
});

function buildPoint(
  id: string,
  status: MonitorHistoryPoint["status"],
  createdAt: string
): MonitorHistoryPoint {
  return {
    id,
    monitorId: "monitor-1",
    status,
    statusCode: status === "up" ? 200 : null,
    latencyMs: 100,
    createdAt,
  };
}
