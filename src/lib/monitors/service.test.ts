import { describe, expect, it } from "vitest";
import { selectDueMonitorsForCycle, spreadInitialMonitorChecks } from "@/lib/monitors/service";

describe("monitor due selection", () => {
  it("prioritizes verification checks before normal due monitors within the batch", () => {
    const selected = selectDueMonitorsForCycle(
      [
        buildDueMonitor("normal-old", false, "2026-05-08T06:55:00.000Z"),
        buildDueMonitor("normal-newer", false, "2026-05-08T06:56:00.000Z"),
        buildDueMonitor("verification", true, "2026-05-08T06:59:00.000Z"),
      ],
      new Map([["user-1", 2]])
    );

    expect(selected.map((monitor) => monitor.id)).toEqual(["verification", "normal-old"]);
  });

  it("keeps per-user batch limits independent", () => {
    const selected = selectDueMonitorsForCycle(
      [
        buildDueMonitor("user-1-verification", true, "2026-05-08T06:59:00.000Z", "user-1"),
        buildDueMonitor("user-1-normal", false, "2026-05-08T06:55:00.000Z", "user-1"),
        buildDueMonitor("user-2-normal", false, "2026-05-08T06:55:00.000Z", "user-2"),
      ],
      new Map([
        ["user-1", 1],
        ["user-2", 1],
      ])
    );

    expect(selected.map((monitor) => monitor.id)).toEqual(["user-1-verification", "user-2-normal"]);
  });
});

describe("monitor cold start spread", () => {
  it("spreads imported monitors across their first interval up to five minutes", () => {
    const scheduled = spreadInitialMonitorChecks(
      Array.from({ length: 5 }, (_, index) => ({
        name: `Monitor ${index + 1}`,
        intervalValue: 5,
        intervalUnit: "dk",
      })),
      new Date("2026-05-08T07:00:00.000Z")
    );

    expect(scheduled.map((monitor) => monitor.nextCheckAt.toISOString())).toEqual([
      "2026-05-08T07:00:00.000Z",
      "2026-05-08T07:01:00.000Z",
      "2026-05-08T07:02:00.000Z",
      "2026-05-08T07:03:00.000Z",
      "2026-05-08T07:04:00.000Z",
    ]);
  });

  it("uses the shortest interval as the spread window for faster monitors", () => {
    const scheduled = spreadInitialMonitorChecks(
      [
        { name: "Fast", intervalValue: 30, intervalUnit: "sn" },
        { name: "Normal", intervalValue: 5, intervalUnit: "dk" },
        { name: "Slow", intervalValue: 1, intervalUnit: "sa" },
      ],
      new Date("2026-05-08T07:00:00.000Z")
    );

    expect(scheduled.map((monitor) => monitor.nextCheckAt.toISOString())).toEqual([
      "2026-05-08T07:00:00.000Z",
      "2026-05-08T07:00:10.000Z",
      "2026-05-08T07:00:20.000Z",
    ]);
  });
});

function buildDueMonitor(
  id: string,
  verificationMode: boolean,
  nextCheckAt: string,
  userId = "user-1"
) {
  return {
    id,
    userId,
    verificationMode,
    nextCheckAt: new Date(nextCheckAt),
    createdAt: new Date("2026-05-08T06:00:00.000Z"),
  };
}
