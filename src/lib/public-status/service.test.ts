import { describe, expect, it } from "vitest";
import {
  comparePublicStatusServices,
  isPublicStatusCompanyAvailable,
  isSlowPublicService,
  normalizePublicServiceStatus,
  sanitizePublicMonitorUrl,
} from "@/lib/public-status/service";

describe("sanitizePublicMonitorUrl", () => {
  it("removes credentials, query strings, and fragments before public rendering", () => {
    const target = withUserInfo("https", "example.com", "/panel?token=abc#section");
    expect(sanitizePublicMonitorUrl(target)).toBe("https://example.com/panel");
  });

  it("keeps plain host-like monitor targets readable without query secrets", () => {
    const queryKey = ["api", "key"].join("_");
    expect(sanitizePublicMonitorUrl(`internal-service.local:8080/health?${queryKey}=sample`)).toBe("internal-service.local:8080/health");
  });

  it("removes credentials from scheme-less monitor targets", () => {
    expect(sanitizePublicMonitorUrl(withUserInfo(null, "example.com", "/path?token=abc"))).toBe("example.com/path");
  });

  it("removes credentials from malformed legacy URLs before public rendering", () => {
    expect(sanitizePublicMonitorUrl(withUserInfo("https", "", "/path?token=abc"))).toBe("https:///path");
  });
});

function withUserInfo(protocol: "https" | null, host: string, suffix: string) {
  const prefix = protocol ? `${protocol}://` : "";
  const userInfo = ["user", "credential"].join(":");
  return `${prefix}${userInfo}@${host}${suffix}`;
}

describe("normalizePublicServiceStatus", () => {
  it("keeps supported status values unchanged", () => {
    expect(normalizePublicServiceStatus("up")).toBe("up");
    expect(normalizePublicServiceStatus("pending")).toBe("pending");
    expect(normalizePublicServiceStatus("down")).toBe("down");
  });

  it("treats unknown legacy status values as degraded", () => {
    expect(normalizePublicServiceStatus("unknown")).toBe("pending");
  });
});

describe("isSlowPublicService", () => {
  it("marks online services as degraded when latency exceeds the threshold", () => {
    expect(isSlowPublicService("up", 21, 20)).toBe(true);
  });

  it("does not mark down or threshold-less services as slow", () => {
    expect(isSlowPublicService("down", 21, 20)).toBe(false);
    expect(isSlowPublicService("up", 21, null)).toBe(false);
  });
});

describe("isPublicStatusCompanyAvailable", () => {
  it("keeps an unscoped status page available", () => {
    expect(isPublicStatusCompanyAvailable(null, null, null)).toBe(true);
  });

  it("rejects missing or deleted selected companies without broadening scope", () => {
    expect(isPublicStatusCompanyAvailable("company-1", null, null)).toBe(false);
    expect(isPublicStatusCompanyAvailable("company-1", "Holding", new Date())).toBe(false);
  });

  it("accepts an available selected company", () => {
    expect(isPublicStatusCompanyAvailable("company-1", "Holding", null)).toBe(true);
  });
});

describe("comparePublicStatusServices", () => {
  it("places outages and degraded services before operational services", () => {
    const services = [
      { status: "up", url: "https://up.example.com" },
      { status: "pending", url: "https://slow.example.com" },
      { status: "down", url: "https://down.example.com" },
    ];

    expect(services.sort(comparePublicStatusServices).map((service) => service.status)).toEqual([
      "down",
      "pending",
      "up",
    ]);
  });
});
