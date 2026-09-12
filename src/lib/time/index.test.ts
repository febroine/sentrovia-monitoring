import { describe, expect, it } from "vitest";
import { formatPanelDateTime } from "@/lib/time";

describe("formatPanelDateTime", () => {
  it("uses the English panel locale while honoring an explicit timezone", () => {
    expect(formatPanelDateTime("2026-12-31T23:05:06.000Z", { timeZone: "UTC" })).toBe(
      "31/12/2026, 23:05:06"
    );
  });

  it("returns the shared placeholder for invalid timestamps", () => {
    expect(formatPanelDateTime("not-a-timestamp", { timeZone: "UTC" })).toBe("--");
  });
});
