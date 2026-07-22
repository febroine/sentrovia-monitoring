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
    const parsed = parseDateFilter("2026-02-28");

    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(1);
    expect(parsed?.getDate()).toBe(28);
  });
});
