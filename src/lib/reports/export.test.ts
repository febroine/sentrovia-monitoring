import { describe, expect, it } from "vitest";
import { buildPrintableReportHtml, buildReportFileSlug } from "@/lib/reports/export";
import type { GeneratedReport } from "@/lib/reports/types";

describe("report exports", () => {
  it("builds an HTML-only report with URL-based monitor identity", () => {
    const report = buildSampleReport();
    const html = buildPrintableReportHtml(report);

    expect(html).toContain("Service snapshot");
    expect(html).toContain("What needs attention");
    expect(html).toContain("Failure details");
    expect(html).toContain("Top failing URLs");
    expect(html).toContain("URL breakdown");
    expect(html).toContain("https://api.example.com");
    expect(html).toContain("The service did not accept a TCP connection before the timeout.");
    expect(html).not.toContain("Status codes");
    expect(html).not.toContain(">Checks<");
    expect(html).not.toContain("Export CSV");
    expect(html).not.toContain("PDF");
    expect(buildReportFileSlug(report)).toBe("weekly-workspace-report-2026-05-05");
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
    brandName: "Sentrovia",
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
    recommendations: ["1 URL is currently down. Prioritize active incidents and restore service health."],
    statusCodes: [
      { statusCode: 200, count: 18 },
      { statusCode: 500, count: 2 },
    ],
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
        currentStatusCode: 500,
        lastCheckedAt: "2026-05-05T07:30:00.000Z",
        lastFailureAt: "2026-05-05T07:30:00.000Z",
        lastErrorMessage: "The service did not accept a TCP connection before the timeout.",
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
