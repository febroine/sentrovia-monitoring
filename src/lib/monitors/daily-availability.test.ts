import { describe, expect, it } from "vitest";
import { buildDailyWindows, formatDateKey, zonedMidnight } from "@/lib/monitors/daily-availability";

describe("zonedMidnight", () => {
  it("returns the instant a day starts in the time zone", () => {
    expect(zonedMidnight("2026-10-02", "Europe/Istanbul").toISOString()).toBe("2026-10-01T21:00:00.000Z");
    expect(zonedMidnight("2026-10-02", "UTC").toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(zonedMidnight("2026-07-01", "America/Los_Angeles").toISOString()).toBe("2026-07-01T07:00:00.000Z");
  });

  it("follows daylight-saving changes", () => {
    expect(zonedMidnight("2026-03-08", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(zonedMidnight("2026-03-09", "America/New_York").toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(zonedMidnight("2026-03-29", "Europe/Berlin").toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(zonedMidnight("2026-03-30", "Europe/Berlin").toISOString()).toBe("2026-03-29T22:00:00.000Z");
  });
});

describe("buildDailyWindows", () => {
  it("covers each calendar day back to back and ends today at now", () => {
    const now = new Date("2026-10-02T09:30:00.000Z");
    const windows = buildDailyWindows(now, "Europe/Istanbul", 90);
    expect(windows).toHaveLength(90);
    expect(windows[89]).toEqual({
      key: "2026-10-02",
      startedAt: new Date("2026-10-01T21:00:00.000Z"),
      endedAt: now,
    });
    expect(windows[0].key).toBe("2026-07-05");
    for (let index = 1; index < windows.length; index += 1) {
      expect(windows[index].startedAt).toEqual(windows[index - 1].endedAt);
    }
  });

  it("uses the local date, not the UTC date, for today", () => {
    const now = new Date("2026-10-01T22:30:00.000Z");
    expect(formatDateKey(now, "Europe/Istanbul")).toBe("2026-10-02");
    expect(buildDailyWindows(now, "Europe/Istanbul", 1)[0].key).toBe("2026-10-02");
  });

  it("gives a daylight-saving day its real length", () => {
    const windows = buildDailyWindows(new Date("2026-03-10T12:00:00.000Z"), "America/New_York", 3);
    expect(windows[0].key).toBe("2026-03-08");
    expect(windows[0].endedAt.getTime() - windows[0].startedAt.getTime()).toBe(23 * 60 * 60 * 1000);
  });
});
