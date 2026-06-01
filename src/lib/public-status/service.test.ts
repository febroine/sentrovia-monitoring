import { describe, expect, it } from "vitest";
import { isSlowPublicService, normalizePublicServiceStatus, sanitizePublicMonitorUrl } from "@/lib/public-status/service";

describe("sanitizePublicMonitorUrl", () => {
  it("removes credentials, query strings, and fragments before public rendering", () => {
    expect(sanitizePublicMonitorUrl("https://user:secret@example.com/panel?token=abc#section")).toBe(
      "https://example.com/panel"
    );
  });

  it("keeps plain host-like monitor targets readable without query secrets", () => {
    expect(sanitizePublicMonitorUrl("internal-service.local:8080/health?api_key=secret")).toBe(
      "internal-service.local:8080/health"
    );
  });

  it("removes credentials from scheme-less monitor targets", () => {
    expect(sanitizePublicMonitorUrl("user:secret@example.com/path?token=abc")).toBe("example.com/path");
  });

  it("removes credentials from malformed legacy URLs before public rendering", () => {
    expect(sanitizePublicMonitorUrl("https://user:secret@/path?token=abc")).toBe("https:///path");
  });
});

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
