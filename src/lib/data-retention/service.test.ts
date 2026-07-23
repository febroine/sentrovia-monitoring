import { describe, expect, it } from "vitest";
import { getSoftDeleteCutoff, shouldRunRetentionCleanup } from "@/lib/data-retention/service";

describe("retention cleanup scheduling", () => {
  const now = new Date("2026-07-16T12:00:00.000Z");

  it("runs when cleanup has never completed", () => {
    expect(shouldRunRetentionCleanup(null, now)).toBe(true);
  });

  it("waits until one hour has elapsed", () => {
    expect(shouldRunRetentionCleanup(new Date("2026-07-16T11:30:00.000Z"), now)).toBe(false);
    expect(shouldRunRetentionCleanup(new Date("2026-07-16T11:00:00.000Z"), now)).toBe(true);
  });

  it("uses an absolute cutoff for expired soft deletes", () => {
    expect(getSoftDeleteCutoff(now)).toEqual(new Date("2026-07-16T11:59:00.000Z"));
  });
});
