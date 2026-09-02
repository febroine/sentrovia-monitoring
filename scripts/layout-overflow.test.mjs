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
    expect(appShell).toContain("w-full min-w-0 max-w-[1600px]");
  });

  it("fits the monitor table to the available content width", () => {
    const table = readSource("src/components/ui/table.tsx");
    const monitorTable = readSource("src/components/monitoring/monitor-table.tsx");

    expect(table).toContain("w-full min-w-0 max-w-full overflow-x-auto");
    expect(monitorTable).toContain("min-w-0 max-w-full overflow-hidden");
    expect(monitorTable).toContain('Table className="min-w-0 table-fixed');
    expect(monitorTable).toContain("<colgroup>");
    expect(monitorTable).toContain("onOpenTimeline");
  });
});
