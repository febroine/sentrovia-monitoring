import { describe, expect, it } from "vitest";
import { getMonitorTargetDisplay, sanitizeMonitorUrlForDisplay } from "@/lib/monitors/targets";

describe("sanitizeMonitorUrlForDisplay", () => {
  it("removes inline credentials, query strings, and fragments from HTTP URLs", () => {
    expect(sanitizeMonitorUrlForDisplay("https://user:secret@example.com/panel?api_key=abc#top")).toBe(
      "https://example.com/panel"
    );
  });

  it("removes credentials and query strings from plain monitor targets", () => {
    expect(sanitizeMonitorUrlForDisplay("user:secret@example.com/path?token=abc")).toBe("example.com/path");
  });
});

describe("getMonitorTargetDisplay", () => {
  it("uses sanitized HTTP targets for operator-facing display", () => {
    expect(
      getMonitorTargetDisplay({
        monitorType: "http",
        url: "https://user:secret@example.com/health?api_key=abc#debug",
      })
    ).toBe("https://example.com/health");
  });
});
