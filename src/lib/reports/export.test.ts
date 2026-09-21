import { describe, expect, it } from "vitest";
import { buildPrintableReportHtml, buildReportFileSlug } from "@/lib/reports/export";
import type { GeneratedReport } from "@/lib/reports/types";

describe("report exports", () => {
  it("builds an HTML-only report with URL-based monitor identity", () => {
    const report = buildSampleReport();
    const html = buildPrintableReportHtml(report);

    expect(html).toContain('font-family: "IBM Plex Sans"');
    expect(html).not.toMatch(/Arial|Helvetica|Inter/);
    expect(html).toContain("Service snapshot");
    expect(html).toContain('<dl class="snapshot-grid">');
    expect(html).toContain("<dt>Reporting window</dt>");
    expect(html).toContain("Executive brief");
    expect(html).toContain("Availability trend");
    expect(html).toContain("Failed checks by day");
    expect(html).toContain("not a configured SLA");
    expect(html).toContain("What needs attention");
    expect(html).toContain("Failure details");
    expect(html).toContain("Top failing URLs");
    expect(html).toContain("Reporting window");
    expect(html).toContain("period-chip");
    expect(html).toContain("Sentrovia &middot; Last 7 days &middot; HTML report");
    expect(html).toContain("URL breakdown");
    expect(html).toContain("https://api.example.com");
    expect(html).toContain("The service did not accept a TCP connection before the timeout.");
    expect(html).not.toContain("Status codes");
    expect(html).not.toContain(">Checks<");
    expect(html).not.toContain("Export CSV");
    expect(html).not.toContain("PDF");
    expect(buildReportFileSlug(report)).toBe("weekly-workspace-report-2026-05-05");
  });

  it("renders report timestamps in the selected report time zone", () => {
    const report = buildSampleReport();
    report.timeZone = "America/New_York";
    report.monitorBreakdown[0].pausedUntil = "2026-05-06T08:00:00.000Z";

    const html = buildPrintableReportHtml(report);

    expect(html).toContain("paused until 06/05/2026, 04:00:00");
    expect(html).toContain("05/05/2026, 03:30:00");
  });

  it("renders measured trends and escapes monitor names in the executive brief", () => {
    const report = buildSampleReport();
    report.monitorBreakdown[0].name = "<script>alert(1)</script>";
    report.dailyMetrics = [{
      date: "2026-05-04", totalChecks: 10, upChecks: 8, downChecks: 2,
      uptimePct: 80, latencySamples: 8, averageLatencyMs: 210, p95LatencyMs: 640,
    }];

    const html = buildPrintableReportHtml(report, { output: "pdf" });
    expect(html).toContain('role="img" aria-label="Availability trend');
    expect(html).toContain("80.00% availability, 2 failed checks");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("PDF report");
  });

  it("includes previous-period comparison and reference budget in printable output", () => {
    const report = buildSampleReport();
    report.comparison = {
      previousPeriodStartedAt: "2026-04-21T08:00:00.000Z",
      previousPeriodEndedAt: "2026-04-28T08:00:00.000Z",
      previousCompletedChecks: 20,
      previousUptimePct: 95,
      uptimeChangePoints: -5,
      previousP95LatencyMs: 400,
      p95LatencyChangeMs: 240,
      referenceUptimePct: 99.9,
      budgetUsedPct: 10_000,
      budgetRemainingPct: 0,
    };
    report.checkCoverage = { actualChecks: 22, expectedChecks: 24, eligibleMonitors: 1, excludedMonitors: 2 };

    const html = buildPrintableReportHtml(report);
    expect(html).toContain("Compared with previous period");
    expect(html).toContain("95.00% previously");
    expect(html).toContain("0.0% remaining");
    expect(html).toContain("check-based 99.9% reference, not an SLA");
    expect(html).toContain("22 / ~24 checks");
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
    monitorId: null,
    monitorName: null,
    workspaceName: "Sentrovia",
    brandName: "Sentrovia",
    templateLabel: "Operations Report",
    generatedAt: "2026-05-05T08:00:00.000Z",
    periodStartedAt: "2026-04-28T08:00:00.000Z",
    periodEndedAt: "2026-05-05T08:00:00.000Z",
    periodLabel: "Last 7 days",
    timeZone: "UTC",
    summary: {
      monitorCount: 2,
      currentlyUp: 1,
      currentlyDown: 1,
      currentlyPending: 0,
      currentlyPaused: 0,
      totalChecks: 20,
      upChecks: 18,
      downChecks: 2,
      pendingChecks: 0,
      hasCompletedChecks: true,
      hasLatencySamples: true,
      uptimePct: 90,
      averageLatencyMs: 210,
      p95LatencyMs: 640,
      failureEvents: 2,
      impactedMonitors: 1,
      failureRatePct: 10,
      healthScore: 72,
      healthStatus: "Watch",
    },
    recommendations: ["1 URL is currently down. Prioritize active outages and restore service health."],
    statusCodes: [
      { statusCode: 200, count: 18 },
      { statusCode: 500, count: 2 },
    ],
    dailyMetrics: [],
    slowMonitors: [{ monitorId: "m1", name: "API", url: "https://api.example.com", averageLatencyMs: 640, checks: 10 }],
    failingMonitors: [
      { monitorId: "m1", name: "API", url: "https://api.example.com", failures: 2, lastFailureAt: "2026-05-05T07:30:00.000Z" },
    ],
    recentFailures: [
      {
        monitorId: "m1",
        name: "API",
        url: "https://api.example.com",
        statusCode: 500,
        message: "connect ETIMEDOUT 5.9.81.212:443",
        rcaSummary: null,
        detail: "The service did not accept a TCP connection before the timeout. Target: 5.9.81.212:443. Original error: connect ETIMEDOUT 5.9.81.212:443",
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
        pausedUntil: null,
        currentStatusCode: 500,
        lastCheckedAt: "2026-05-05T07:30:00.000Z",
        lastFailureAt: "2026-05-05T07:30:00.000Z",
        lastErrorMessage: "The service did not accept a TCP connection before the timeout.",
        hasCompletedChecks: true,
        hasLatencySamples: true,
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
