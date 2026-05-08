import { describe, expect, it } from "vitest";
import { selectDueMonitorsForCycle } from "@/lib/monitors/service";

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
