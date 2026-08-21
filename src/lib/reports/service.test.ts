import { describe, expect, it } from "vitest";
import {
  assertReportScheduleCompanyAvailable,
  buildReportMessage,
  calculateReportSummaryMetrics,
  normalizeReportStatus,
  resolveReportPeriod,
  resolveReportTitle,
  scheduleNextRunAfter,
} from "@/lib/reports/service";
import type { GeneratedReport } from "@/lib/reports/types";

describe("normalizeReportStatus", () => {
  it("keeps supported status values unchanged", () => {
    expect(normalizeReportStatus("up")).toBe("up");
    expect(normalizeReportStatus("pending")).toBe("pending");
    expect(normalizeReportStatus("down")).toBe("down");
  });

  it("treats unknown legacy status values as pending", () => {
    expect(normalizeReportStatus("unknown")).toBe("pending");
  });
});

describe("scheduleNextRunAfter", () => {
  it("clamps end-of-month schedules instead of skipping February", () => {
    const nextRun = scheduleNextRunAfter(
      new Date("2027-01-31T08:00:00.000Z"),
      "monthly",
      new Date("2027-01-31T09:00:00.000Z")
    );

    expect(nextRun.toISOString()).toBe("2027-02-28T08:00:00.000Z");
  });

  it("keeps an end-of-month schedule anchored after February", () => {
    const nextRun = scheduleNextRunAfter(
      new Date("2027-01-31T08:00:00.000Z"),
      "monthly",
      new Date("2027-03-01T08:00:00.000Z")
    );

    expect(nextRun.toISOString()).toBe("2027-03-31T08:00:00.000Z");
  });
});

describe("resolveReportPeriod", () => {
  const now = new Date("2026-08-14T12:00:00.000Z");

  it("always uses a rolling seven-day window", () => {
    const period = resolveReportPeriod(now);

    expect(period.startedAt.toISOString()).toBe("2026-08-07T12:00:00.000Z");
    expect(period.endedAt).toBe(now);
    expect(period.label).toBe("Last 7 days");
  });
});

describe("resolveReportTitle", () => {
  it("does not label a rolling seven-day report as monthly or all-time", () => {
    expect(resolveReportTitle("weekly", "global", null)).toBe("Weekly Workspace Report");
    expect(resolveReportTitle("monthly", "global", null)).toBe("7-Day Workspace Report");
    expect(resolveReportTitle("all_time", "company", "Payments")).toBe("7-Day Payments Report");
  });
});

describe("report summary metrics", () => {
  it("does not penalize the same failed checks through uptime and failure rate", () => {
    const summary = calculateReportSummaryMetrics({
      totalChecks: 100,
      upChecks: 99,
      downChecks: 1,
      latencySamples: 100,
      averageLatencyMs: 120,
      p95LatencyMs: 240,
      currentlyDown: 0,
    });

    expect(summary.uptimePct).toBe(99);
    expect(summary.failureRatePct).toBe(1);
    expect(summary.healthScore).toBe(99);
    expect(summary.healthStatus).toBe("Excellent");
  });

  it("marks periods without completed checks as unavailable instead of healthy", () => {
    const summary = calculateReportSummaryMetrics({
      totalChecks: 0,
      upChecks: 0,
      downChecks: 0,
      latencySamples: 0,
      averageLatencyMs: 0,
      p95LatencyMs: 0,
      currentlyDown: 0,
    });

    expect(summary).toMatchObject({
      hasCompletedChecks: false,
      hasLatencySamples: false,
      healthScore: 0,
      healthStatus: "No data",
      uptimePct: 0,
      failureRatePct: 0,
    });
  });
});

describe("report schedule company availability", () => {
  it("rejects company schedules whose company was deleted", () => {
    expect(() => assertReportScheduleCompanyAvailable("company", null)).toThrow(
      "The company assigned to this report schedule is unavailable."
    );
  });

  it("allows workspace schedules without a company", () => {
    expect(() => assertReportScheduleCompanyAvailable("global", null)).not.toThrow();
  });
});

describe("report email branding", () => {
  it("uses the report-panel brand in the default subject and email design", () => {
    const message = buildReportMessage(buildReport(), {
      deliveryDetailLevel: "standard",
      includeOutageSummary: true,
      includeMonitorBreakdown: true,
      emailSubjectTemplate: null,
      emailIntroTemplate: null,
    });

    expect(message.subject).toBe("[Acme Reliability Operations Report] Weekly Workspace Report");
    expect(message.htmlBody).toContain("Acme Reliability");
    expect(message.htmlBody).toContain("Reliability intelligence");
    expect(message.htmlBody).toContain('white-space:nowrap;">Last 7 days</div>');
    expect(message.htmlBody).not.toContain('width:34px;height:34px');
    expect(message.htmlBody).toContain("Excellent health");
    expect(message.htmlBody).toContain("Prepared for Workspace by");
    expect(message.htmlBody).not.toContain("Sentrovia");
    expect(message.htmlBody).toContain('name="color-scheme" content="light"');
    expect(message.htmlBody).toContain("[data-ogsc]");
    expect(message.htmlBody).toContain('bgcolor="#ffffff"');
  });

  it("replaces the complete email subject with the user's template", () => {
    const message = buildReportMessage(buildReport(), {
      deliveryDetailLevel: "summary",
      includeOutageSummary: false,
      includeMonitorBreakdown: false,
      emailSubjectTemplate: "{brand} | {title} | {health_status}",
      emailIntroTemplate: "{period}: {uptime} uptime",
    });

    expect(message.subject).toBe("Acme Reliability | Weekly Workspace Report | Excellent");
    expect(message.textBody).toContain("Last 7 days: 99.95% uptime");
  });
});

function buildReport(): GeneratedReport {
  return {
    title: "Weekly Workspace Report",
    scope: "global",
    cadence: "weekly",
    template: "operations",
    companyId: null,
    companyName: null,
    workspaceName: "Acme Reliability",
    brandName: "Acme Reliability",
    templateLabel: "Operations Report",
    generatedAt: "2026-08-20T08:00:00.000Z",
    periodStartedAt: "2026-08-13T08:00:00.000Z",
    periodEndedAt: "2026-08-20T08:00:00.000Z",
    periodLabel: "Last 7 days",
    summary: {
      monitorCount: 4,
      currentlyUp: 4,
      currentlyDown: 0,
      currentlyPending: 0,
      totalChecks: 1000,
      upChecks: 999,
      downChecks: 1,
      pendingChecks: 0,
      hasCompletedChecks: true,
      hasLatencySamples: true,
      uptimePct: 99.95,
      averageLatencyMs: 120,
      p95LatencyMs: 240,
      failureEvents: 1,
      impactedMonitors: 1,
      failureRatePct: 0.05,
      healthScore: 98,
      healthStatus: "Excellent",
    },
    recommendations: ["No immediate operational action is required."],
    statusCodes: [{ statusCode: 200, count: 999 }],
    slowMonitors: [],
    failingMonitors: [],
    recentFailures: [],
    monitorBreakdown: [],
  };
}
