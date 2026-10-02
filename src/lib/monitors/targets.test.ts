import { describe, expect, it } from "vitest";
import {
  buildCanonicalMonitorTarget,
  buildMonitorIdentityKey,
  getMonitorTargetDisplay,
  parseDnsMonitorTarget,
  sanitizeMonitorUrlForDisplay,
  stripHttpUrlCredentials,
  toMonitorPayload,
} from "@/lib/monitors/targets";
import { DEFAULT_MONITOR_FORM, type MonitorRecord } from "@/lib/monitors/types";

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

describe("stripHttpUrlCredentials", () => {
  it("removes URL userinfo without discarding the monitor path, query, or fragment", () => {
    expect(
      stripHttpUrlCredentials("https://canary-user:canary-pass@example.com/health?region=eu#keyword=ready")
    ).toBe("https://example.com/health?region=eu#keyword=ready");
  });

  it("leaves URLs without userinfo unchanged", () => {
    const url = "https://example.com/health?region=eu#keyword=ready";
    expect(stripHttpUrlCredentials(url)).toBe(url);
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

describe("DNS monitor targets", () => {
  const base = { ...DEFAULT_MONITOR_FORM, monitorType: "dns" as const, portHost: "Example.COM.", dnsRecordType: "MX" as const };

  it("stores the name, record type and DNS server in the target", () => {
    expect(buildCanonicalMonitorTarget(base)).toBe("dns://example.com/MX");
    expect(buildCanonicalMonitorTarget({ ...base, dnsServer: "1.1.1.1" })).toBe("dns://example.com/MX?server=1.1.1.1");
    expect(buildCanonicalMonitorTarget({ ...base, portHost: "_dmarc.example.com", dnsRecordType: "TXT", dnsServer: "[2606:4700::1111]" }))
      .toBe("dns://_dmarc.example.com/TXT?server=2606%3A4700%3A%3A1111");
  });

  it("reads the target back", () => {
    expect(parseDnsMonitorTarget("dns://_dmarc.example.com/TXT?server=2606%3A4700%3A%3A1111")).toEqual({
      host: "_dmarc.example.com",
      recordType: "TXT",
      server: "2606:4700::1111",
    });
    expect(parseDnsMonitorTarget("dns://example.com/BOGUS")).toEqual({ host: "example.com", recordType: "A", server: "" });
  });

  it("shows and identifies DNS monitors by name, type and server", () => {
    expect(getMonitorTargetDisplay({ monitorType: "dns", url: "dns://example.com/MX?server=1.1.1.1" })).toBe("example.com MX @1.1.1.1");
    expect(buildMonitorIdentityKey({ monitorType: "dns", url: "dns://example.com/MX" }))
      .not.toBe(buildMonitorIdentityKey({ monitorType: "dns", url: "dns://example.com/A" }));
  });

  it("restores the form fields from a saved monitor", () => {
    const payload = toMonitorPayload({
      ...DEFAULT_MONITOR_FORM,
      monitorType: "dns",
      url: "dns://example.com/MX?server=1.1.1.1",
      dnsExpectedValues: "10 mail.example.com",
      dnsMatchMode: "exact",
    } as unknown as MonitorRecord);
    expect(payload).toMatchObject({
      portHost: "example.com",
      url: "",
      dnsRecordType: "MX",
      dnsServer: "1.1.1.1",
      dnsExpectedValues: "10 mail.example.com",
      dnsMatchMode: "exact",
    });
  });
});
