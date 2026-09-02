import { describe, expect, it } from "vitest";
import { formatLatency } from "@/components/monitoring/utils";

describe("formatLatency", () => {
  it("preserves a zero-millisecond latency sample", () => {
    expect(formatLatency(0)).toBe("0ms");
  });

  it("uses a placeholder only when latency is unavailable", () => {
    expect(formatLatency(null)).toBe("--");
  });
});
