import { describe, expect, it } from "vitest";
import { buildPrintableReportHtml, buildReportCsv, buildReportFileSlug } from "@/lib/reports/export";
import { buildReportPdf } from "@/lib/reports/pdf";
import type { GeneratedReport } from "@/lib/reports/types";

describe("report exports", () => {
  it("includes report v2 operational details in csv and html exports", () => {
    const report = buildSampleReport();
    const csv = buildReportCsv(report);
    const html = buildPrintableReportHtml(report);

    expect(csv).toContain("Health score");
    expect(csv).toContain("P95 latency");
    expect(csv).toContain("Recent failures");
    expect(csv).toContain('"Monitor","Company","URL"');
    expect(html).toContain("Recommended actions");
    expect(html).toContain("Recent failure events");
    expect(html).toContain("P95");
    expect(buildReportFileSlug(report)).toBe("weekly-workspace-report-2026-05-05");
  });

  it("builds a non-empty pdf attachment", async () => {
    const pdf = await buildReportPdf(buildSampleReport());

    expect(pdf.byteLength).toBeGreaterThan(1_000);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});

function buildSampleReport(): GeneratedReport {
  return {
    title: "Weekly Workspace Report",
    scope: "global",
    cadence: "weekly",
    template: "operations",
    companyId: null,
    companyName: null,
    workspaceName: "Sentrovia",
    templateLabel: "Operations Report",
    generatedAt: "2026-05-05T08:00:00.000Z",
    periodStartedAt: "2026-04-28T08:00:00.000Z",
    periodEndedAt: "2026-05-05T08:00:00.000Z",
    periodLabel: "Last 7 days",
    summary: {
      monitorCount: 2,
      currentlyUp: 1,
      currentlyDown: 1,
      currentlyPending: 0,
      totalChecks: 20,
      upChecks: 18,
      downChecks: 2,
      pendingChecks: 0,
      uptimePct: 90,
      averageLatencyMs: 210,
      p95LatencyMs: 640,
      failureEvents: 2,
      impactedMonitors: 1,
      failureRatePct: 10,
      healthScore: 72,
      healthStatus: "Watch",
    },
    recommendations: ["1 monitor is currently down. Prioritize active incidents before scheduled maintenance."],
    statusCodes: [
      { statusCode: 200, count: 18 },
      { statusCode: 500, count: 2 },
    ],
    slowMonitors: [{ monitorId: "m1", name: "API", averageLatencyMs: 640, checks: 10 }],
    failingMonitors: [
      { monitorId: "m1", name: "API", failures: 2, lastFailureAt: "2026-05-05T07:30:00.000Z" },
    ],
    recentFailures: [
      {
        monitorId: "m1",
        name: "API",
        statusCode: 500,
        message: "Failed",
        rcaSummary: "Server error",
        createdAt: "2026-05-05T07:30:00.000Z",
      },
    ],
    monitorBreakdown: [
      {
        monitorId: "m1",
        name: "API",
        url: "https://api.example.com",
        companyName: "Acme",
        status: "down",
        currentStatusCode: 500,
        lastCheckedAt: "2026-05-05T07:30:00.000Z",
        lastFailureAt: "2026-05-05T07:30:00.000Z",
        lastErrorMessage: "HTTP 500",
        uptimePct: 80,
        averageLatencyMs: 640,
        p95LatencyMs: 900,
        totalChecks: 10,
        upChecks: 8,
        downChecks: 2,
        pendingChecks: 0,
        failures: 2,
      },
    ],
  };
}
