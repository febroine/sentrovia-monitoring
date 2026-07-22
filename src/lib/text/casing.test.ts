import { describe, expect, it } from "vitest";
import { toEnglishUppercase } from "@/lib/text/casing";

describe("text casing", () => {
  it("uses English uppercase rules for UI labels", () => {
    expect(toEnglishUppercase("security")).toBe("SECURITY");
    expect(toEnglishUppercase("outage")).toBe("OUTAGE");
  });
});
