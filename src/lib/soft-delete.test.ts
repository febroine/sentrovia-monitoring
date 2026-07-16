import { describe, expect, it } from "vitest";
import { parseSoftDeleteUndoDeadline } from "@/lib/soft-delete";

describe("soft-delete undo deadlines", () => {
  it("uses the server deadline when it is valid", () => {
    expect(parseSoftDeleteUndoDeadline("2026-07-16T12:01:00.000Z", 1)).toBe(1784203260000);
  });

  it("expires immediately when the server deadline is missing or invalid", () => {
    expect(parseSoftDeleteUndoDeadline(null, 123)).toBe(123);
    expect(parseSoftDeleteUndoDeadline("invalid", 456)).toBe(456);
  });
});
