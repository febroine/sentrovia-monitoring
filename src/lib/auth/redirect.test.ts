import { describe, expect, it } from "vitest";
import { buildLoginRedirectPath, resolveSafeAuthRedirect } from "@/lib/auth/redirect";

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

  it.each(["\n", "\r", "\t"])("rejects protocol-relative redirects obscured by %j", (control) => {
    const result = resolveSafeAuthRedirect(`/${control}/example.com/path`);
    expect(new URL(result, "https://sentrovia.test").origin).toBe("https://sentrovia.test");
    expect(result).toBe("/dashboard");
  });
});

describe("buildLoginRedirectPath", () => {
  it("encodes the complete protected destination", () => {
    expect(buildLoginRedirectPath("/monitoring?create=1&company=company-1")).toBe(
      "/login?next=%2Fmonitoring%3Fcreate%3D1%26company%3Dcompany-1"
    );
  });

  it("falls back before encoding an unsafe destination", () => {
    expect(buildLoginRedirectPath("https://example.com")).toBe(
      "/login?next=%2Fdashboard"
    );
  });
});
