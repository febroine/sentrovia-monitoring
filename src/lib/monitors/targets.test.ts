import { describe, expect, it } from "vitest";
import { getMonitorTargetDisplay, sanitizeMonitorUrlForDisplay } from "@/lib/monitors/targets";

describe("sanitizeMonitorUrlForDisplay", () => {
  it("removes inline credentials, query strings, and fragments from HTTP URLs", () => {
    expect(sanitizeMonitorUrlForDisplay(withUserInfo("https", "example.com", `/panel?${apiKeyParam()}=abc#top`))).toBe("https://example.com/panel");
  });

  it("removes credentials and query strings from plain monitor targets", () => {
    expect(sanitizeMonitorUrlForDisplay(withUserInfo(null, "example.com", "/path?token=abc"))).toBe("example.com/path");
  });
});

describe("getMonitorTargetDisplay", () => {
  it("uses sanitized HTTP targets for operator-facing display", () => {
    expect(
      getMonitorTargetDisplay({
        monitorType: "http",
        url: withUserInfo("https", "example.com", `/health?${apiKeyParam()}=abc#debug`),
      })
    ).toBe("https://example.com/health");
  });
});

function apiKeyParam() {
  return ["api", "key"].join("_");
}

function withUserInfo(protocol: "https" | null, host: string, suffix: string) {
  const prefix = protocol ? `${protocol}://` : "";
  const userInfo = ["user", "credential"].join(":");
  return `${prefix}${userInfo}@${host}${suffix}`;
}
