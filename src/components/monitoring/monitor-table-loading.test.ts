import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MonitorTable } from "@/components/monitoring/monitor-table";
import { DEFAULT_MONITOR_FORM, type MonitorRecord } from "@/lib/monitors/types";

function renderTable(loading: boolean, populated = true) {
  const monitor: MonitorRecord = {
    ...DEFAULT_MONITOR_FORM,
    id: "monitor-1", name: "Existing monitor", url: "https://example.com",
    status: "up", statusCode: 200, uptime: "100.00%", tags: [],
    lastCheckedAt: null, nextCheckAt: null, latencyMs: null,
    pausedUntil: null, verificationMode: false,
    isFavorite: false, isCritical: false, lastSuccessAt: null, lastFailureAt: null,
    sslExpiresAt: null, lastErrorMessage: null, consecutiveFailures: 0, verificationFailureCount: 0,
  };
  const noop = () => {};
  const props: ComponentProps<typeof MonitorTable> = {
    monitors: populated ? [monitor] : [], visibleColumns: [], loading, readOnly: false,
    selectedIds: new Set(), allPageSelected: false, somePageSelected: false,
    activeTogglePendingId: null, pausePendingId: null, flagPendingId: null, recheckPendingId: null,
    onToggleAll: noop, onToggleOne: noop, onToggleActive: noop, onPause: noop,
    onResumePause: noop, onToggleFlag: noop, onRecheck: noop, onEdit: noop, onOpenTimeline: noop,
  };
  return renderToStaticMarkup(createElement(MonitorTable, props));
}

describe("monitor table loading", () => {
  it("keeps desktop and mobile rows visible but non-interactive during a refresh", () => {
    const html = renderTable(true);
    expect(html).toContain("Existing monitor");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('inert=""');
    expect(html).toContain("Updating monitors");
    expect(html).not.toContain("Loading monitors");
  });

  it("shows the initial loading state when there are no rows", () => {
    expect(renderTable(true, false)).toContain("Loading monitors");
  });

  it("restores interaction after a request completes", () => {
    const html = renderTable(false);
    expect(html).toContain("Existing monitor");
    expect(html).not.toContain('inert=""');
    expect(html).not.toContain("Updating monitors");
  });
});
