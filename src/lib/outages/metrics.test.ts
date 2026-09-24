import { describe, expect, it } from "vitest";
import { calculateMonitorReportDurationMs, calculateTimeUptimePct, summarizeOutages } from "@/lib/outages/metrics";

describe("report outage metrics", () => {
  const start = new Date("2026-09-20T00:00:00Z");
  const end = new Date("2026-09-21T00:00:00Z");

  it("counts a long outage once and clips its duration to the historical period", () => {
    const metrics = summarizeOutages([
      { monitorId: "a", startedAt: new Date("2026-09-19T23:00:00Z"), resolvedAt: new Date("2026-09-20T02:00:00Z") },
      { monitorId: "a", startedAt: new Date("2026-09-20T20:00:00Z"), resolvedAt: null },
    ], start, end);

    expect(metrics.get("a")).toEqual({ incidentCount: 2, downtimeMs: 6 * 60 * 60 * 1000 });
    expect(calculateTimeUptimePct(24 * 60 * 60 * 1000, metrics.get("a")!.downtimeMs)).toBe(75);
  });

  it("does not double-count overlapping duration or include boundary-only incidents", () => {
    const metrics = summarizeOutages([
      { monitorId: "a", startedAt: start, resolvedAt: new Date("2026-09-20T02:00:00Z") },
      { monitorId: "a", startedAt: new Date("2026-09-20T01:00:00Z"), resolvedAt: new Date("2026-09-20T03:00:00Z") },
      { monitorId: "a", startedAt: end, resolvedAt: null },
      { monitorId: "b", startedAt: new Date("2026-09-19T00:00:00Z"), resolvedAt: start },
    ], start, end);

    expect(metrics.get("a")).toEqual({ incidentCount: 2, downtimeMs: 3 * 60 * 60 * 1000 });
    expect(metrics.has("b")).toBe(false);
  });

  it("counts a zero-length incident inside the period without adding downtime", () => {
    const at = new Date("2026-09-20T12:00:00Z");
    expect(summarizeOutages([{ monitorId: "a", startedAt: at, resolvedAt: at }], start, end).get("a"))
      .toEqual({ incidentCount: 1, downtimeMs: 0 });
  });

  it("weights availability by elapsed monitor time and clips it to creation and report bounds", () => {
    expect(calculateMonitorReportDurationMs(start, end, new Date("2026-09-20T12:00:00Z")))
      .toBe(12 * 60 * 60 * 1000);
    expect(calculateMonitorReportDurationMs(start, end, new Date("2026-09-22T00:00:00Z"))).toBe(0);
    expect(calculateTimeUptimePct(12 * 60 * 60 * 1000, 60 * 60 * 1000)).toBe(91.67);
    expect(calculateTimeUptimePct(12 * 60 * 60 * 1000, 24 * 60 * 60 * 1000)).toBe(0);
    expect(calculateTimeUptimePct(0, 0)).toBe(0);
  });

  it("returns no incidents for a report range after its effective end", () => {
    expect(summarizeOutages([{ monitorId: "a", startedAt: start, resolvedAt: null }], end, start).size).toBe(0);
  });
});
