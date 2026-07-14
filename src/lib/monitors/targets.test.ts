import { describe, expect, it } from "vitest";
import {
  buildMonitorIdentityKey,
  getMonitorTargetDisplay,
  sanitizeMonitorUrlForDisplay,
} from "@/lib/monitors/targets";

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

describe("buildMonitorIdentityKey", () => {
  it("normalizes case-insensitive URL hostnames and default URL formatting", () => {
    const first = buildMonitorIdentityKey({ monitorType: "http", url: "HTTPS://EXAMPLE.COM:443" });
    const second = buildMonitorIdentityKey({ monitorType: "http", url: "https://example.com/" });

    expect(first).toBe(second);
  });

  it("preserves case-sensitive URL paths and assertion fragments", () => {
    const upperPath = buildMonitorIdentityKey({ monitorType: "http", url: "https://example.com/API" });
    const lowerPath = buildMonitorIdentityKey({ monitorType: "http", url: "https://example.com/api" });
    const upperKeyword = buildMonitorIdentityKey({
      monitorType: "keyword",
      url: "https://example.com/#keyword=Ready",
    });
    const lowerKeyword = buildMonitorIdentityKey({
      monitorType: "keyword",
      url: "https://example.com/#keyword=ready",
    });

    expect(upperPath).not.toBe(lowerPath);
    expect(upperKeyword).not.toBe(lowerKeyword);
  });

  it("preserves case-sensitive heartbeat tokens", () => {
    const upperToken = buildMonitorIdentityKey({ monitorType: "heartbeat", url: "heartbeat://TokenABC" });
    const lowerToken = buildMonitorIdentityKey({ monitorType: "heartbeat", url: "heartbeat://tokenabc" });

    expect(upperToken).not.toBe(lowerToken);
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
