import { describe, expect, it } from "vitest";
import { buildCompanyHealth, calculateAverageIntervalMinutes, computeUptimePct } from "@/lib/dashboard/service";

describe("dashboard service", () => {
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

  it("treats windows with only pending checks as fully available until settled", () => {
    expect(computeUptimePct([{ status: "pending" }])).toBe(100);
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
});
