import { describe, expect, it, vi } from "vitest";
import { calculateSlaPeriod, loadOutageCountsOrFallback } from "@/lib/monitoring/sla-service";

describe("SLA period calculations", () => {
  it("calculates uptime from all settled checks", () => {
    expect(calculateSlaPeriod("24h SLA", 90, 10, 100)).toEqual({
      label: "24h SLA",
      uptimePct: 90,
      outages: 10,
      totalChecks: 100,
    });
  });

  it("treats an empty period as fully available", () => {
    expect(calculateSlaPeriod("7d SLA", 0, 0, 0).uptimePct).toBe(100);
  });

  it("bounds inconsistent check counts while preserving the independent outage count", () => {
    expect(calculateSlaPeriod("24h SLA", 12, 14, 10)).toMatchObject({
      uptimePct: 100,
      outages: 14,
      totalChecks: 10,
    });
  });

  it("keeps SLA check history available when outage counts cannot be loaded", async () => {
    const error = new Error("outage history unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(loadOutageCountsOrFallback(Promise.reject(error))).resolves.toEqual({
      total24Hours: 0,
      total7Days: 0,
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[sentrovia] Outage counts unavailable; SLA uptime will use monitor check history.",
      error
    );
    consoleError.mockRestore();
  });
});
