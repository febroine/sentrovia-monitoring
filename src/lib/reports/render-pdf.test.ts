import { describe, expect, it } from "vitest";
import { renderReportPdf } from "@/lib/reports/render-pdf";
import type { GeneratedReport } from "@/lib/reports/types";

describe("PDF report rendering", () => {
  it("renders a standalone PDF using the installed Chromium", async () => {
    const report = {
      title: "Weekly Workspace Report",
      scope: "global",
      cadence: "weekly",
      template: "operations",
      companyId: null,
      companyName: null,
      monitorId: null,
      monitorName: null,
      workspaceName: "Sentrovia",
      brandName: "Sentrovia",
      templateLabel: "Operations Report",
      periodLabel: "Last 7 days",
      periodStartedAt: "2026-09-09T00:00:00Z",
      periodEndedAt: "2026-09-16T00:00:00Z",
      generatedAt: "2026-09-16T00:00:00Z",
      timeZone: "UTC",
      recommendations: [],
      slowMonitors: [],
      failingMonitors: [],
      recentFailures: [],
      monitorBreakdown: [],
      statusCodes: [],
      dailyMetrics: [],
      summary: {
        monitorCount: 0, currentlyUp: 0, currentlyDown: 0, currentlyPending: 0, currentlyPaused: 0,
        totalChecks: 0, upChecks: 0, downChecks: 0, pendingChecks: 0,
        hasCompletedChecks: false, hasLatencySamples: false, uptimePct: 0, p95LatencyMs: 0,
        averageLatencyMs: 0, failureEvents: 0, impactedMonitors: 0, failureRatePct: 0,
        healthScore: 0, healthStatus: "No data",
      },
    } satisfies GeneratedReport;
    const pdf = await renderReportPdf(report);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(10_000);
  }, 30_000);
});
