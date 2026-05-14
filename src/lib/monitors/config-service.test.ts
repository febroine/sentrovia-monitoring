import { describe, expect, it } from "vitest";
import { parseMonitorConfigBundle } from "@/lib/monitors/config-service";

describe("monitor config bundle parsing", () => {
  it("returns a config validation error for malformed YAML", () => {
    expect(() => parseMonitorConfigBundle("monitors: [", "yaml")).toThrow(
      "The uploaded monitor config bundle is invalid."
    );
  });
});
