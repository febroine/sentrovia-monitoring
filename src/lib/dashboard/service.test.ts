import { describe, expect, it, vi } from "vitest";
import {
  buildActivationChecklist,
  buildCompanyHealth,
  buildDashboardMonitorFocus,
  calculateAverageLatency,
  calculateAverageIntervalMinutes,
  computeUptimePct,
  countCertificatesExpiringSoon,
  loadDashboardSection,
} from "@/lib/dashboard/service";

describe("dashboard service", () => {
  it("derives activation steps from real workspace state", () => {
    const activation = buildActivationChecklist({
      hasMonitor: true,
      workerRunning: true,
      workerConnectivityStatus: "online",
      deliveredCount: 0,
    });

    expect(activation.completed).toBe(2);
    expect(activation.complete).toBe(false);
    expect(activation.steps.find((step) => step.id === "delivery")?.complete).toBe(false);
  });
  it("calculates average monitor interval in minutes across mixed units", () => {
    const average = calculateAverageIntervalMinutes([
      { intervalValue: 30, intervalUnit: "sn" },
      { intervalValue: 5, intervalUnit: "dk" },
      { intervalValue: 1, intervalUnit: "sa" },
    ]);

    expect(average).toBe(22);
  });

  it("returns zero average interval when there are no active monitors", () => {
    expect(calculateAverageIntervalMinutes([])).toBe(0);
  });

  it("excludes pending verification checks from uptime percentage", () => {
    expect(
      computeUptimePct([
        { status: "up" },
        { status: "down" },
        { status: "pending" },
        { status: "pending" },
      ])
    ).toBe(50);
  });

  it("marks windows with only pending checks as unavailable", () => {
    expect(computeUptimePct([{ status: "pending" }])).toBeNull();
  });

  it("does not present missing latency samples as zero milliseconds", () => {
    expect(calculateAverageLatency([{ latencyMs: null }])).toBeNull();
    expect(calculateAverageLatency([{ latencyMs: 100 }, { latencyMs: null }, { latencyMs: 200 }])).toBe(150);
  });

  it("counts expiring certificates only when certificate monitoring is enabled", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    expect(countCertificatesExpiringSoon([
      { checkSslExpiry: true, sslExpiresAt: new Date("2026-09-01T12:00:00.000Z") },
      { checkSslExpiry: false, sslExpiresAt: new Date("2026-09-01T12:00:00.000Z") },
      { checkSslExpiry: true, sslExpiresAt: new Date("2026-10-01T12:00:00.000Z") },
    ], now)).toBe(1);
  });

  it("keeps a company named Unassigned separate from monitors without a company", () => {
    const groups = buildCompanyHealth([
      { companyId: "company-1", company: "Unassigned", isActive: true, status: "up" },
      { companyId: null, company: null, isActive: true, status: "down" },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Unassigned", up: 1, down: 0 }),
      expect.objectContaining({ name: "Unassigned", up: 0, down: 1 }),
    ]));
  });

  it("keeps optional dashboard sections from crashing the entire page", async () => {
    const error = new Error("delivery history is unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const section = await loadDashboardSection(
      "notification delivery",
      Promise.reject(error),
      { delivered: 0 }
    );

    expect(section).toEqual({
      data: { delivered: 0 },
      warning: "notification delivery",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[sentrovia] Dashboard notification delivery unavailable.",
      error,
    );
    consoleError.mockRestore();
  });

  it("keeps critical and favorite monitors at the top of the focus list", () => {
    const monitors = buildDashboardMonitorFocus([
      {
        id: "down",
        name: "Down service",
        monitorType: "http",
        url: "https://down.example.com",
        companyId: null,
        company: null,
        isActive: true,
        isFavorite: false,
        isCritical: false,
        status: "down",
        statusCode: 500,
        latencyMs: null,
        lastCheckedAt: null,
      },
      {
        id: "favorite",
        name: "Favorite service",
        monitorType: "http",
        url: "https://favorite.example.com",
        companyId: null,
        company: null,
        isActive: true,
        isFavorite: true,
        isCritical: false,
        status: "up",
        statusCode: 200,
        latencyMs: 100,
        lastCheckedAt: null,
      },
      {
        id: "critical",
        name: "Critical service",
        monitorType: "http",
        url: "https://critical.example.com",
        companyId: null,
        company: null,
        isActive: true,
        isFavorite: false,
        isCritical: true,
        status: "up",
        statusCode: 200,
        latencyMs: 120,
        lastCheckedAt: null,
      },
    ], "all");

    expect(monitors.map((monitor) => monitor.id)).toEqual(["critical", "favorite", "down"]);
  });

  it("keeps every active monitor in the focus list", () => {
    const monitors = Array.from({ length: 20 }, (_, index) => buildFocusMonitor(`monitor-${index}`));

    expect(buildDashboardMonitorFocus(monitors, "all")).toHaveLength(20);
  });

  it("applies favorite and critical focus filters", () => {
    const monitors = [
      buildFocusMonitor("standard"),
      buildFocusMonitor("favorite", { isFavorite: true }),
      buildFocusMonitor("critical", { isCritical: true }),
      buildFocusMonitor("both", { isFavorite: true, isCritical: true }),
    ];

    expect(buildDashboardMonitorFocus(monitors, "favorites").map((monitor) => monitor.id)).toEqual(["both", "favorite"]);
    expect(buildDashboardMonitorFocus(monitors, "critical").map((monitor) => monitor.id)).toEqual(["both", "critical"]);
  });
});

function buildFocusMonitor(
  id: string,
  overrides: Partial<{ isFavorite: boolean; isCritical: boolean }> = {}
) {
  return {
    id,
    name: id,
    monitorType: "http",
    url: `https://${id}.example.com`,
    companyId: null,
    company: null,
    isActive: true,
    isFavorite: false,
    isCritical: false,
    status: "up",
    statusCode: 200,
    latencyMs: 100,
    lastCheckedAt: null,
    ...overrides,
  };
}
