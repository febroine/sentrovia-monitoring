import { describe, expect, it } from "vitest";
import { buildCsv } from "@/lib/logs/presets";
import type { LogRecord } from "@/lib/logs/types";

const record: LogRecord = {
  id: "event", createdAt: "2026-09-09T12:00:00.000Z", level: "critical", eventType: "failure",
  companyName: "Company", monitorName: "Monitor", message: "Unavailable", status: "down",
  statusCode: 500, latencyMs: 0, rcaType: null, rcaTitle: null, rcaSummary: null,
  companyId: "company", monitorId: "monitor", detailTitle: null, detailSummary: null, detailItems: [],
};

describe("log CSV export", () => {
  it.each([
    "=1+1", "+1+1", "-1+1", "@SUM(1,1)", "  =1+1", "\u00a0=1+1",
    "\t=1+1", " \r\n=1+1", "\ttext", "\u0000=1+1",
  ])("exports formula and control prefixes as text: %j", (value) => {
    const csv = buildCsv([{ ...record, companyName: value, monitorName: value, message: value }]);
    const protectedCell = `"'${value.replaceAll('"', '""')}"`;
    expect(csv).toContain(`,${protectedCell},${protectedCell},${protectedCell},500,0`);
  });

  it("escapes injected quotes and separators after neutralizing a formula", () => {
    const csv = buildCsv([{ ...record, monitorName: '=HYPERLINK("https://example.invalid","link")' }]);
    expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"",""link"")"');
  });

  it("preserves ordinary quotes, embedded newlines, spaces, and empty cells", () => {
    const csv = buildCsv([{ ...record, companyName: 'ACME, "West"', monitorName: "  API monitor", message: "First line\nSecond line" }]);
    expect(csv).toBe('timestamp,level,eventType,company,monitor,message,statusCode,latencyMs\n'
      + '"2026-09-09T12:00:00.000Z","critical","failure","ACME, ""West""","  API monitor","First line\nSecond line",500,0');
    expect(buildCsv([{ ...record, companyName: null, monitorName: null, message: null, statusCode: null, latencyMs: null }]))
      .toContain(',"","","",,');
  });
});
