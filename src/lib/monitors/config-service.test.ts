import { describe, expect, it } from "vitest";
import { parseMonitorConfigBundle } from "@/lib/monitors/config-service";
import { DEFAULT_MONITOR_FORM } from "@/lib/monitors/types";

describe("monitor config bundle parsing", () => {
  it("returns a config validation error for malformed YAML", () => {
    expect(() => parseMonitorConfigBundle("monitors: [", "yaml")).toThrow(
      "The uploaded monitor config bundle is invalid."
    );
  });

  it("rejects oversized monitor config bundles before parsing", () => {
    const raw = JSON.stringify({
      monitors: [
        {
          ...DEFAULT_MONITOR_FORM,
          name: "Large monitor",
          url: `https://example.com/${"x".repeat(1_000_000)}`,
        },
      ],
    });

    expect(() => parseMonitorConfigBundle(raw, "json")).toThrow(
      "The uploaded monitor config bundle is too large."
    );
  });

  it("rejects monitor config bundles with too many monitors", () => {
    const raw = JSON.stringify({
      monitors: Array.from({ length: 501 }, (_, index) => ({
        ...DEFAULT_MONITOR_FORM,
        name: `Monitor ${index}`,
        url: `https://example-${index}.com`,
      })),
    });

    expect(() => parseMonitorConfigBundle(raw, "json")).toThrow(
      "Import at most 500 monitors at a time."
    );
  });
});
