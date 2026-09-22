import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LogsTable } from "@/components/logs/logs-table";
import type { LogRecord } from "@/lib/logs/types";

describe("log table refresh", () => {
  it("retains existing rows while blocking actions until refresh completes", () => {
    const log: LogRecord = {
      id: "event", createdAt: "2026-09-22T08:00:00.000Z", level: "info", eventType: "check",
      message: "Existing healthy result", status: "up", statusCode: 200, latencyMs: 10,
      rcaType: null, rcaTitle: null, rcaSummary: null, companyId: null, companyName: null,
      monitorId: "monitor", monitorName: "API", detailTitle: null, detailSummary: null, detailItems: [],
    };
    const noop = () => {};
    const html = renderToStaticMarkup(createElement(LogsTable, {
      logs: [log], total: 1, loading: true, selectedIds: new Set<string>(), highlightIds: new Set<string>(),
      page: 1, pageSize: 10, onToggleSelect: noop, onToggleAll: noop, onPageChange: noop, onPageSizeChange: noop,
    }));
    expect(html).toContain("Existing healthy result");
    expect(html).toContain("Updating logs");
    expect(html).toContain('inert=""');
    expect(html).not.toContain("Loading logs");
  });
});
