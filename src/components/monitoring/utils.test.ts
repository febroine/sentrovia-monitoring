import { describe, expect, it } from "vitest";
import { changedPayloadFields, duplicatePayloadFromMonitor, formatLatency } from "@/components/monitoring/utils";
import { DEFAULT_MONITOR_FORM, type MonitorRecord } from "@/lib/monitors/types";

describe("formatLatency", () => {
  it("preserves a zero-millisecond latency sample", () => {
    expect(formatLatency(0)).toBe("0ms");
  });

  it("uses a placeholder only when latency is unavailable", () => {
    expect(formatLatency(null)).toBe("--");
  });
});

describe("duplicatePayloadFromMonitor", () => {
  const source = {
    ...DEFAULT_MONITOR_FORM,
    id: "monitor-1",
    name: "Shop API",
    url: "https://shop.example.com/health",
    monitorType: "heartbeat",
    heartbeatToken: "token-of-the-original-monitor",
    heartbeatLastReceivedAt: "2026-10-01T10:00:00.000Z",
    databasePassword: "",
    databasePasswordConfigured: true,
    tags: ["prod"],
    timeout: 9000,
  } as unknown as MonitorRecord;

  it("copies the settings under a new name", () => {
    const payload = duplicatePayloadFromMonitor({ ...source, monitorType: "http" });
    expect(payload.name).toBe("Shop API (copy)");
    expect(payload.url).toBe("https://shop.example.com/health");
    expect(payload.tags).toEqual(["prod"]);
    expect(payload.timeout).toBe(9000);
  });

  it("leaves out the original's heartbeat token and database password", () => {
    const payload = duplicatePayloadFromMonitor(source);
    expect(payload.heartbeatToken).toBe("");
    expect(payload.heartbeatLastReceivedAt).toBeNull();
    expect(payload.databasePasswordConfigured).toBe(false);
  });

  it("keeps the copied name within the name limit", () => {
    expect(duplicatePayloadFromMonitor({ ...source, name: "x".repeat(120) }).name).toHaveLength(120);
  });
});

describe("changedPayloadFields", () => {
  it("lists only the fields that differ from the starting values", () => {
    const initial = { ...DEFAULT_MONITOR_FORM, tags: ["prod"], intervalValue: 5 };
    expect(changedPayloadFields(initial, { ...initial, intervalValue: 1, tags: ["prod"] })).toEqual(["intervalValue"]);
    expect(changedPayloadFields(initial, { ...initial, tags: ["prod", "api"] })).toEqual(["tags"]);
    expect(changedPayloadFields(initial, { ...initial })).toEqual([]);
  });
});
