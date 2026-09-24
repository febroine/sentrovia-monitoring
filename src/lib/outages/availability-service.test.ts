import { describe, expect, it } from "vitest";
import { summarizeAvailabilityWindow } from "@/lib/outages/availability-service";

const window = {
  key: "day",
  startedAt: new Date("2026-09-20T00:00:00Z"),
  endedAt: new Date("2026-09-21T00:00:00Z"),
};

describe("duration-based availability", () => {
  it("counts repeated down checks as one outage and weights monitors by elapsed time", () => {
    const result = summarizeAvailabilityWindow(
      [
        { id: "full", createdAt: new Date("2026-09-19T00:00:00Z") },
        { id: "half", createdAt: new Date("2026-09-20T12:00:00Z") },
      ],
      [
        { monitorId: "full", completedChecks: 100, downChecks: 50 },
        { monitorId: "half", completedChecks: 10, downChecks: 0 },
      ],
      [{ monitorId: "full", startedAt: new Date("2026-09-20T12:00:00Z"), resolvedAt: new Date("2026-09-20T13:00:00Z") }],
      window
    );

    expect(result.monitors.get("full")).toMatchObject({ uptimePct: 95.83, incidentCount: 1, downtimeMs: 3_600_000 });
    expect(result.monitors.get("half")).toMatchObject({ uptimePct: 100, observedMs: 12 * 3_600_000 });
    expect(result).toMatchObject({ hasData: true, uptimePct: 97.22, incidentCount: 1, completedChecks: 110 });
  });

  it("does not call missing historical outage records healthy uptime", () => {
    const result = summarizeAvailabilityWindow(
      [{ id: "legacy", createdAt: window.startedAt }],
      [{ monitorId: "legacy", completedChecks: 20, downChecks: 10 }],
      [],
      window
    );
    expect(result.monitors.get("legacy")).toMatchObject({ hasData: false, incompleteHistory: true });
    expect(result).toMatchObject({ hasData: false, incompleteHistory: true, completedChecks: 20 });
  });

  it("can measure a recorded outage that spans the whole window without a new check", () => {
    const result = summarizeAvailabilityWindow(
      [{ id: "down", createdAt: window.startedAt }],
      [],
      [{ monitorId: "down", startedAt: new Date("2026-09-19T23:00:00Z"), resolvedAt: null }],
      window
    );
    expect(result.monitors.get("down")).toMatchObject({ hasData: true, uptimePct: 0, incidentCount: 1 });
  });
});
