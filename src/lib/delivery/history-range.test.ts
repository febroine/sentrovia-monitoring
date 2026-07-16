import { describe, expect, it } from "vitest";
import {
  formatCalendarDateInput,
  isValidCalendarDate,
  resolveDeliveryHistoryRange,
  shiftLocalCalendarDays,
} from "@/lib/delivery/history-range";

describe("delivery history deletion ranges", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");

  it("formats the browser's local date instead of the UTC calendar date", () => {
    expect(formatCalendarDateInput(new Date("2026-07-01T23:30:00.000Z"), -180)).toBe("2026-07-02");
  });

  it("moves by calendar days rather than fixed 24-hour periods", () => {
    const shifted = shiftLocalCalendarDays(new Date(2026, 6, 16, 12), -7);
    expect(shifted.getFullYear()).toBe(2026);
    expect(shifted.getMonth()).toBe(6);
    expect(shifted.getDate()).toBe(9);
    expect(shifted.getHours()).toBe(12);
  });

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
