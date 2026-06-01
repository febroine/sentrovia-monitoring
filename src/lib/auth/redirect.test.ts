import { describe, expect, it } from "vitest";
import { resolveSafeAuthRedirect } from "@/lib/auth/redirect";

describe("resolveSafeAuthRedirect", () => {
  it("keeps internal application paths", () => {
    expect(resolveSafeAuthRedirect("/monitoring?create=1")).toBe("/monitoring?create=1");
  });

  it("falls back for absolute and scheme-relative URLs", () => {
    expect(resolveSafeAuthRedirect("https://example.com")).toBe("/dashboard");
    expect(resolveSafeAuthRedirect("//example.com/path")).toBe("/dashboard");
  });

  it("falls back for empty or backslash-based paths", () => {
    expect(resolveSafeAuthRedirect("")).toBe("/dashboard");
    expect(resolveSafeAuthRedirect("\\\\example.com")).toBe("/dashboard");
  });
});
