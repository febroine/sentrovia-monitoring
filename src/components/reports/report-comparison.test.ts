import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportComparison } from "@/components/reports/report-comparison";
import type { GeneratedReport } from "@/lib/reports/types";

describe("report comparison presentation", () => {
  it("shows previous-period evidence and the check-based reference", () => {
    const report = {
      timeZone: "UTC",
      checkCoverage: { actualChecks: 22, expectedChecks: 24, eligibleMonitors: 1, excludedMonitors: 2 },
      comparison: {
        previousPeriodStartedAt: "2026-09-04T12:00:00.000Z",
        previousPeriodEndedAt: "2026-09-11T12:00:00.000Z",
        previousCompletedChecks: 5_000,
        previousUptimePct: 100,
        uptimeChangePoints: -0.02,
        previousP95LatencyMs: 300,
        p95LatencyChangeMs: -50,
        referenceUptimePct: 99.9,
        budgetUsedPct: 20,
        budgetRemainingPct: 80,
      },
    } as GeneratedReport;
    const html = renderToStaticMarkup(createElement(ReportComparison, { report }));

    expect(html).toContain("5,000 completed checks in the same monitor scope");
    expect(html).toContain("-0.02 pp");
    expect(html).toContain("80.0% remaining");
    expect(html).toContain("not an SLA");
    expect(html).toContain("22 / ~24 checks");
  });

  it("keeps missing prior checks distinct from a measured zero", () => {
    const report = {
      timeZone: "UTC",
      comparison: {
        previousPeriodStartedAt: "2026-09-04T12:00:00.000Z",
        previousPeriodEndedAt: "2026-09-11T12:00:00.000Z",
        previousCompletedChecks: 0,
        previousUptimePct: null,
        uptimeChangePoints: null,
        previousP95LatencyMs: null,
        p95LatencyChangeMs: null,
        referenceUptimePct: 99.9,
        budgetUsedPct: null,
        budgetRemainingPct: null,
      },
    } as GeneratedReport;
    const html = renderToStaticMarkup(createElement(ReportComparison, { report }));

    expect(html).toContain("No prior checks");
    expect(html).toContain("No completed checks");
  });

  it("uses a compact analytics summary when the previous period has no checks", () => {
    const report = {
      timeZone: "UTC",
      comparison: {
        previousPeriodStartedAt: "2026-09-04T12:00:00.000Z",
        previousPeriodEndedAt: "2026-09-11T12:00:00.000Z",
        previousCompletedChecks: 0,
        previousUptimePct: null,
        uptimeChangePoints: null,
        previousP95LatencyMs: null,
        p95LatencyChangeMs: null,
        referenceUptimePct: 99.9,
        budgetUsedPct: 0,
        budgetRemainingPct: 100,
      },
    } as GeneratedReport;
    const html = renderToStaticMarkup(createElement(ReportComparison, { report, compactWhenNoPrior: true }));

    expect(html).toContain("No previous checks to compare");
    expect(html).toContain("100.0% remaining");
    expect(html).not.toContain("Check success change");
    expect(html).not.toContain("P95 latency change");
  });
});
