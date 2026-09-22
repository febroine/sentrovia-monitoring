import { describe, expect, it } from "vitest";
import { parseMonitorCsv, replaceMonitorCsvCell, toMonitorImportRecord } from "@/lib/monitors/csv-import";

const mapping = new Map([
  ["name", "name"],
  ["monitorType", "monitorType"],
  ["url", "url"],
]);

describe("monitor CSV import", () => {
  it("parses Excel-style semicolon CSV files with a BOM", () => {
    const rows = parseMonitorCsv("\uFEFFname;monitorType;url\r\nAPI;http;example.com/health");

    expect(rows).toEqual([
      ["name", "monitorType", "url"],
      ["API", "http", "example.com/health"],
    ]);
  });

  it("preserves quoted delimiters and escaped quotes", () => {
    const rows = parseMonitorCsv('name,monitorType,url\n"API, primary",http,"https://example.com/a?label=""ready"""');

    expect(rows[1]).toEqual(["API, primary", "http", 'https://example.com/a?label="ready"']);
  });

  it("only sends fields present in a minimal mapped CSV row", () => {
    const record = toMonitorImportRecord(
      ["Name", "MonitorType", "URL", "timeout"],
      ["A", "HTTP", "www.example.com", ""],
      mapping
    );

    expect(record).toEqual({ name: "A", monitorType: "http", url: "www.example.com" });
  });

  it("accepts a two-column name and URL row so server defaults can supply the monitor type", () => {
    const record = toMonitorImportRecord(
      ["name", "url"],
      ["Example", "example.com"],
      mapping
    );

    expect(record).toEqual({ name: "Example", url: "example.com" });
  });
});

describe("replaceMonitorCsvCell", () => {
  it("adds a missing trailing cell so an invalid short row can be corrected", () => {
    const rows = [["name", "url", "company"], ["API"]];
    const updated = replaceMonitorCsvCell(rows, 2, 1, "https://api.example");
    expect(updated).toEqual([["name", "url", "company"], ["API", "https://api.example", ""]]);
    expect(rows[1]).toEqual(["API"]);
  });
});
