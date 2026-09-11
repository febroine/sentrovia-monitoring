import { describe, expect, it } from "vitest";
import {
  buildFailureSegments,
  changeExclusionSelection,
  getChartAvailability,
  isExclusionSelected,
  isMonitorExcludedByFilters,
  reconcileFiltersWithCatalog,
  shouldRetryAnalyticsWithoutMonitor,
} from "@/components/reports/report-analytics-workspace";
import { getFailureBarWidth } from "@/components/reports/report-preview-panel";
import type { GeneratedReport } from "@/lib/reports/types";

describe("report analytics catalog reconciliation", () => {
  it("clears a deleted selection and stale exclusions before the report request", () => {
    const filters = reconcileFiltersWithCatalog({
      periodRange: "7d",
      monitorId: "deleted-monitor",
      startedAt: "",
      endedAt: "",
      excludeMonitorIds: ["deleted-monitor", "monitor-1"],
      excludeTags: ["retired", "production"],
      excludeCompanyIds: ["deleted-company", "company-1"],
    }, [{
      id: "monitor-1",
      name: "Checkout API",
      url: "https://example.com/health",
      companyId: "company-1",
      tags: ["production"],
      isActive: true,
    }], [{ id: "company-1", name: "Acme" }]);

    expect(filters).toMatchObject({
      monitorId: "all",
      excludeMonitorIds: ["monitor-1"],
      excludeTags: ["production"],
      excludeCompanyIds: ["company-1"],
    });
  });

  it("matches excluded tags without case sensitivity", () => {
    const monitor = {
      id: "monitor-1",
      name: "Checkout API",
      url: "https://example.com/health",
      companyId: "company-1",
      tags: ["production"],
      isActive: true,
    };
    const filters = reconcileFiltersWithCatalog({
      periodRange: "7d",
      monitorId: "monitor-1",
      startedAt: "",
      endedAt: "",
      excludeMonitorIds: [],
      excludeTags: ["PRODUCTION", "production"],
      excludeCompanyIds: [],
    }, [monitor], [{ id: "company-1", name: "Acme" }]);

    expect(filters.excludeTags).toEqual(["production"]);
    expect(filters.monitorId).toBe("all");
    expect(isMonitorExcludedByFilters(monitor, filters)).toBe(true);
    expect(isExclusionSelected(filters.excludeTags, "PRODUCTION", true)).toBe(true);
    expect(changeExclusionSelection(filters.excludeTags, "PRODUCTION", true, true)).toEqual(["production"]);
    expect(changeExclusionSelection(filters.excludeTags, "PRODUCTION", false, true)).toEqual([]);
  });

  it("does not let a filter group exceed the API exclusion limit", () => {
    const selected = Array.from({ length: 100 }, (_, index) => `monitor-${index}`);
    expect(changeExclusionSelection(selected, "monitor-101", true)).toBe(selected);
  });

  it("only retries a missing selected monitor with the all-monitors scope", () => {
    expect(shouldRetryAnalyticsWithoutMonitor(404, "monitor-1")).toBe(true);
    expect(shouldRetryAnalyticsWithoutMonitor(404, "all")).toBe(false);
    expect(shouldRetryAnalyticsWithoutMonitor(500, "monitor-1")).toBe(false);
  });
});

describe("failure concentration", () => {
  it("keeps the four largest contributors and combines the remainder", () => {
    const monitors = [9, 7, 5, 3, 2, 1].map((failures, index) => ({
      monitorId: `monitor-${index}`,
      name: `Monitor ${index}`,
      failures,
    })) as GeneratedReport["monitorBreakdown"];

    expect(buildFailureSegments(monitors)).toEqual([
      { id: "monitor-0", label: "Monitor 0", detail: undefined, failures: 9 },
      { id: "monitor-1", label: "Monitor 1", detail: undefined, failures: 7 },
      { id: "monitor-2", label: "Monitor 2", detail: undefined, failures: 5 },
      { id: "monitor-3", label: "Monitor 3", detail: undefined, failures: 3 },
      { id: "other", label: "Other monitors", detail: null, failures: 3 },
    ]);
  });
});

describe("report preview failure bars", () => {
  it("keeps low failure counts proportional instead of inflating them to ten percent", () => {
    expect(getFailureBarWidth(1, 100)).toBe("1%");
    expect(getFailureBarWidth(0, 100)).toBe("0%");
    expect(getFailureBarWidth(100, 100)).toBe("100%");
  });
});

describe("analytics chart availability", () => {
  it("distinguishes a healthy period from a period without latency samples", () => {
    const metrics = [{
      date: "2026-09-11",
      totalChecks: 24,
      upChecks: 24,
      downChecks: 0,
      uptimePct: 100,
      latencySamples: 0,
      averageLatencyMs: null,
      p95LatencyMs: null,
    }];

    expect(getChartAvailability(metrics)).toEqual({
      hasFailures: false,
      hasLatencySamples: false,
    });
  });

  it("recognizes failure and latency chart data independently", () => {
    const metrics = [{
      date: "2026-09-11",
      totalChecks: 24,
      upChecks: 23,
      downChecks: 1,
      uptimePct: 95.83,
      latencySamples: 24,
      averageLatencyMs: 120,
      p95LatencyMs: 240,
    }];

    expect(getChartAvailability(metrics)).toEqual({
      hasFailures: true,
      hasLatencySamples: true,
    });
  });
});
