import { describe, expect, it } from "vitest";
import { DEFAULT_MONITOR_COLUMNS, parseMonitorTablePreferences } from "@/components/monitoring/monitor-table-columns";

describe("monitor table preferences", () => {
  it("restores valid user preferences without duplicating columns", () => {
    expect(parseMonitorTablePreferences(JSON.stringify({
      columns: ["delivery", "delivery", "company", "unknown"],
      pageSize: 50,
      sort: "latencyMs",
      direction: "asc",
    }))).toEqual({ columns: ["delivery", "company"], pageSize: 50, sort: "latencyMs", direction: "asc" });
  });

  it("falls back safely for obsolete or broken data", () => {
    expect(parseMonitorTablePreferences("broken")).toBeNull();
    expect(parseMonitorTablePreferences(JSON.stringify({ pageSize: -1, sort: "unknown" }))).toEqual({
      columns: DEFAULT_MONITOR_COLUMNS,
      pageSize: 10,
      sort: "createdAt",
      direction: "desc",
    });
  });
});
