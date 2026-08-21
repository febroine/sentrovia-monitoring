import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("security headers", () => {
  it("applies baseline browser protections to every route", async () => {
    const rules = await nextConfig.headers?.();
    const headers = rules?.[0]?.headers ?? [];
    const valueFor = (key: string) => headers.find((header) => header.key === key)?.value;

    expect(rules?.[0]?.source).toBe("/:path*");
    expect(valueFor("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(valueFor("Content-Security-Policy")).toContain("object-src 'none'");
    expect(valueFor("Permissions-Policy")).toContain("camera=()");
    expect(valueFor("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(valueFor("X-Content-Type-Options")).toBe("nosniff");
    expect(valueFor("X-Frame-Options")).toBe("DENY");
  });
});
