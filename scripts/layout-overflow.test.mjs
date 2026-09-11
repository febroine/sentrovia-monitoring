import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

function readSource(relativePath) {
  return readFileSync(resolve(projectRoot, relativePath), "utf8");
}

describe("wide table containment", () => {
  it("allows the application content column to shrink beside the sidebar", () => {
    const appShell = readSource("src/components/app-shell.tsx");

    expect(appShell).toContain("min-h-screen min-w-0 flex-1 flex-col");
    expect(appShell).toContain("w-full min-w-0 max-w-[1760px]");
  });

  it("keeps wide monitor columns readable within a horizontally scrolling container", () => {
    const table = readSource("src/components/ui/table.tsx");
    const monitorTable = readSource("src/components/monitoring/monitor-table.tsx");

    expect(table).toContain("w-full min-w-0 max-w-full overflow-x-auto");
    expect(monitorTable).toContain("min-w-0 max-w-full overflow-x-auto");
    expect(monitorTable).toContain('Table className="min-w-[1180px] table-fixed');
    expect(monitorTable).toContain("<colgroup>");
    expect(monitorTable).toContain("onOpenTimeline");
  });

  it("keeps the dashboard monitor list in a bounded horizontal rail", () => {
    const monitorFocus = readSource("src/components/dashboard/dashboard-monitor-focus.tsx");

    expect(monitorFocus).toContain('role="region"');
    expect(monitorFocus).toContain("overflow-x-auto");
    expect(monitorFocus).toContain('aria-label="Scroll monitors back"');
    expect(monitorFocus).toContain('aria-label="Scroll monitors forward"');
  });

  it("keeps the Monitoring as Code controls aligned and its footer inset", () => {
    const configDialog = readSource("src/components/monitoring/monitor-config-dialog.tsx");

    expect(configDialog).toContain('<SelectTrigger id="monitor-config-format">');
    expect(configDialog).not.toContain('className="h-10 min-w-[140px]"');
    expect(configDialog).toContain('DialogFooter className="m-0 shrink-0 rounded-none border-t bg-background px-6 py-4"');
  });
});
