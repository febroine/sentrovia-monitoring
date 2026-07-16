import { describe, expect, it } from "vitest";
import { isValidCalendarDate, resolveDeliveryHistoryRange } from "@/lib/delivery/history-range";

describe("delivery history deletion ranges", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");

  it("resolves rolling preset ranges", () => {
    expect(resolveDeliveryHistoryRange({ range: "last_7_days" }, now)).toEqual({
      from: new Date("2026-07-09T12:00:00.000Z"),
      toExclusive: now,
    });
    expect(resolveDeliveryHistoryRange({ range: "last_30_days" }, now).from).toEqual(
      new Date("2026-06-16T12:00:00.000Z")
    );
  });

  it("includes the full custom end date", () => {
    expect(resolveDeliveryHistoryRange({ range: "custom", from: "2026-07-01", to: "2026-07-03" }, now)).toEqual({
      from: new Date("2026-07-01T00:00:00.000Z"),
      toExclusive: new Date("2026-07-04T00:00:00.000Z"),
    });
  });

  it("applies the browser timezone offset to custom calendar days", () => {
    expect(
      resolveDeliveryHistoryRange({
        range: "custom",
        from: "2026-07-01",
        to: "2026-07-01",
        timezoneOffsetMinutes: -180,
      }, now)
    ).toEqual({
      from: new Date("2026-06-30T21:00:00.000Z"),
      toExclusive: new Date("2026-07-01T21:00:00.000Z"),
    });
  });

  it("rejects impossible or reversed custom dates", () => {
    expect(isValidCalendarDate("2026-02-30")).toBe(false);
    expect(() => resolveDeliveryHistoryRange({ range: "custom", from: "2026-07-04", to: "2026-07-03" }, now)).toThrow(
      "Enter a valid custom date range."
    );
  });
});
