import { describe, expect, it } from "vitest";
import { parseMonitorText, parseTextImportTags } from "@/lib/monitors/text-import";

describe("monitor TXT import", () => {
  it("adds the selected protocol and derives monitor names", () => {
    expect(parseMonitorText("example.com\nwww.example.org/health", "https")).toEqual([
      { name: "example.com", url: "https://example.com/", lineNumber: 1 },
      { name: "example.org/health", url: "https://www.example.org/health", lineNumber: 2 },
    ]);
  });

  it("preserves explicit protocols, ignores comments, and removes duplicates", () => {
    expect(parseMonitorText("# Production\nhttp://example.com\n\nhttp://example.com", "https")).toEqual([
      { name: "example.com", url: "http://example.com/", lineNumber: 2 },
    ]);
  });

  it("reports the original line number for invalid entries", () => {
    expect(() => parseMonitorText("example.com\nnot a domain", "https")).toThrow(
      "Line 2: Enter a valid domain or HTTP(S) URL."
    );
  });

  it("rejects non-HTTP protocols", () => {
    expect(() => parseMonitorText("ftp://example.com", "https")).toThrow(
      "Line 1: Only HTTP and HTTPS domains are supported."
    );
  });

  it("rejects credentials instead of treating an email address as a domain", () => {
    expect(() => parseMonitorText("user@example.com", "https")).toThrow(
      "Line 1: URLs with embedded credentials are not supported."
    );
  });

  it("removes fragments before duplicate detection because fragments are not sent in HTTP requests", () => {
    expect(parseMonitorText("example.com/#one\nexample.com/#two", "https")).toEqual([
      { name: "example.com", url: "https://example.com/", lineNumber: 1 },
    ]);
  });

  it("keeps raw tag entry usable while normalizing separators and duplicates at import time", () => {
    expect(parseTextImportTags("production, api; production\ncritical")).toEqual([
      "production",
      "api",
      "critical",
    ]);
  });
});
