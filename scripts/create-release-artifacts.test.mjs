import { describe, expect, it } from "vitest";
import { assertReleaseTag, formatChecksum } from "./create-release-artifacts.mjs";

describe("release artifacts", () => {
  it("accepts only the exact package version tag", () => {
    expect(() => assertReleaseTag("v0.3.1", "0.3.1")).not.toThrow();
    expect(() => assertReleaseTag("v0.3.0", "0.3.1")).toThrow(/must match package version/);
    expect(() => assertReleaseTag("latest", "0.3.1")).toThrow(/must match package version/);
  });

  it("writes sha256sum-compatible lowercase output", () => {
    expect(formatChecksum("AABB", "release.zip")).toBe("aabb  release.zip\n");
  });
});
