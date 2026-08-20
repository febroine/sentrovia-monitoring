import { describe, expect, it } from "vitest";
import { parseRecoveryIdentifier } from "./recover-admin.mjs";

describe("admin recovery arguments", () => {
  it("normalizes a spaced identifier option", () => {
    expect(parseRecoveryIdentifier(["--identifier", " Admin@Example.COM "])).toBe("admin@example.com");
  });

  it("accepts an inline username option", () => {
    expect(parseRecoveryIdentifier(["--identifier=Primary.Admin"])).toBe("primary.admin");
  });

  it("rejects a missing identifier", () => {
    expect(() => parseRecoveryIdentifier([])).toThrow("Provide an existing email or username");
  });
});
