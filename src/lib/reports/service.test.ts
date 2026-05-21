import { describe, expect, it } from "vitest";
import { normalizeReportStatus } from "@/lib/reports/service";

describe("normalizeReportStatus", () => {
  it("keeps supported status values unchanged", () => {
    expect(normalizeReportStatus("up")).toBe("up");
    expect(normalizeReportStatus("pending")).toBe("pending");
    expect(normalizeReportStatus("down")).toBe("down");
  });

  it("treats unknown legacy status values as pending", () => {
    expect(normalizeReportStatus("unknown")).toBe("pending");
  });
});
