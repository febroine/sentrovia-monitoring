import { describe, expect, it } from "vitest";
import {
  assertReportScheduleCompanyAvailable,
  buildReportMessage,
  calculateReportSummaryMetrics,
  normalizeReportStatus,
  normalizeReportScheduleStatus,
  normalizeReportScheduleCadence,
  resolveReportFailureStats,
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

describe("normalizeReportScheduleStatus", () => {
  it("maps legacy error states to the supported failed state", () => {
    expect(normalizeReportScheduleStatus("error")).toBe("failed");
    expect(normalizeReportScheduleStatus("delivered")).toBe("delivered");
    expect(normalizeReportScheduleStatus("unknown")).toBe("idle");
  });
});

describe("normalizeReportScheduleCadence", () => {
  it("maps legacy all-time schedules to their historical monthly behavior", () => {
    expect(normalizeReportScheduleCadence("weekly")).toBe("weekly");
    expect(normalizeReportScheduleCadence("monthly")).toBe("monthly");
    expect(normalizeReportScheduleCadence("all_time")).toBe("monthly");
  });
});

describe("scheduleNextRunAfter", () => {
  it("keeps weekly schedules on the same UTC time across daylight-saving changes", () => {
    const nextRun = scheduleNextRunAfter(
      new Date("2026-03-01T15:00:00.000Z"),
      "weekly",
      new Date("2026-03-02T00:00:00.000Z")
    );

    expect(nextRun.toISOString()).toBe("2026-03-08T15:00:00.000Z");
  });

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

  it("uses a rolling seven-day window for weekly reports", () => {
    const period = resolveReportPeriod(now);

    expect(period.startedAt.toISOString()).toBe("2026-08-07T12:00:00.000Z");
    expect(period.endedAt).toBe(now);
    expect(period.label).toBe("Last 7 days");
  });

  it("uses a rolling thirty-day window for monthly reports", () => {
    const period = resolveReportPeriod(now, "monthly");

    expect(period.startedAt.toISOString()).toBe("2026-07-15T12:00:00.000Z");
    expect(period.endedAt).toBe(now);
    expect(period.label).toBe("Last 30 days");
  });

  it("uses explicit inclusive calendar dates and reports their timezone", () => {
    const period = resolveReportPeriod(now, "weekly", {
      periodRange: "custom",
      periodStartedAt: "2026-08-01T21:00:00.000Z",
      periodEndedAt: "2026-08-05T21:00:00.000Z",
      timeZone: "Europe/Istanbul",
    });

    expect(period.startedAt.toISOString()).toBe("2026-08-01T21:00:00.000Z");
    expect(period.endedAt.toISOString()).toBe("2026-08-05T21:00:00.000Z");
    expect(period.timeZone).toBe("Europe/Istanbul");
    expect(period.label).toContain("2 Aug 2026");
  });
});

describe("resolveReportTitle", () => {
  it("labels weekly and monthly report periods accurately", () => {
    expect(resolveReportTitle("weekly", "global", null)).toBe("Weekly Workspace Report");
    expect(resolveReportTitle("monthly", "global", null)).toBe("Monthly Workspace Report");
    expect(resolveReportTitle("all_time", "company", "Payments")).toBe("Monthly Payments Report");
    expect(resolveReportTitle("weekly", "global", null, "custom")).toBe("Custom Workspace Report");
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

describe("report failure statistics", () => {
  it("uses confirmed down checks and their in-window timestamp", () => {
    const lastFailureAt = new Date("2026-08-13T10:15:00.000Z");

    expect(resolveReportFailureStats({ downChecks: 3, lastFailureAt })).toEqual({
      failures: 3,
      lastFailureAt: lastFailureAt.toISOString(),
    });
  });

  it("returns an empty result when a monitor has no checks in the report window", () => {
    expect(resolveReportFailureStats(undefined)).toEqual({
      failures: 0,
      lastFailureAt: null,
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
    timeZone: "UTC",
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
