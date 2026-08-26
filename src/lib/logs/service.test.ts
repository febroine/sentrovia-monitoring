import { describe, expect, it } from "vitest";
import { AuthError } from "@/lib/auth/errors";
import { mapEventToLevel, parseDateFilter } from "@/lib/logs/service";

describe("log service filters", () => {
  it("keeps displayed event levels mutually consistent", () => {
    expect(mapEventToLevel("failure", "down")).toBe("critical");
    expect(mapEventToLevel("latency", "up")).toBe("warning");
    expect(mapEventToLevel("recovery", "up")).toBe("info");
    expect(mapEventToLevel("diagnostic_failed", "down")).toBe("error");
  });

  it("rejects calendar dates that JavaScript would otherwise roll forward", () => {
    expect(() => parseDateFilter("2026-02-31")).toThrow(AuthError);
  });

  it("parses a valid local calendar date without changing the day", () => {
    const parsed = parseDateFilter("2026-02-28", 0);

    expect(parsed).toEqual(new Date("2026-02-28T00:00:00.000Z"));
  });

  it("interprets calendar filters in the browser timezone", () => {
    expect(parseDateFilter("2026-07-01", -180)).toEqual(
      new Date("2026-06-30T21:00:00.000Z")
    );
  });
});
