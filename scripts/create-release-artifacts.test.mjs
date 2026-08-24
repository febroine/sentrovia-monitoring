import { describe, expect, it } from "vitest";
import { assertReleaseTag, formatChecksum } from "./create-release-artifacts.mjs";

describe("release artifacts", () => {
  it("accepts only the exact package version tag", () => {
    expect(() => assertReleaseTag("v1.2.3", "1.2.3")).not.toThrow();
    expect(() => assertReleaseTag("v1.2.2", "1.2.3")).toThrow(/must match package version/);
    expect(() => assertReleaseTag("latest", "1.2.3")).toThrow(/must match package version/);
  });

  it("writes sha256sum-compatible lowercase output", () => {
    expect(formatChecksum("AABB", "release.zip")).toBe("aabb  release.zip\n");
  });
});
