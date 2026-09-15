import { afterEach, describe, expect, it, vi } from "vitest";
import { generateReportPreview, sendReportPreview } from "@/components/reports/reports-page-actions";
import { EMPTY_REPORT_DRAFT } from "@/components/reports/reports-page-model";
import type { GeneratedReport } from "@/lib/reports/types";

describe("report preview request invalidation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not restore an invalidated preview response", async () => {
    const report = { title: "Stale report" } as GeneratedReport;
    const runtime = buildRuntime(() => false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ report })));

    await generateReportPreview(EMPTY_REPORT_DRAFT, runtime);

    expect(runtime.setPreview).not.toHaveBeenCalled();
    expect(runtime.notify).not.toHaveBeenCalled();
    expect(runtime.setSaving).toHaveBeenNthCalledWith(1, true);
    expect(runtime.setSaving).toHaveBeenLastCalledWith(false);
  });

  it("does not restore invalidated delivery details", async () => {
    const report = { title: "Stale delivered report" } as GeneratedReport;
    const runtime = buildRuntime(() => false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      report,
      delivery: { status: "delivered", deliveredAt: "2026-09-15T08:00:00.000Z" },
    })));

    await sendReportPreview({
      ...EMPTY_REPORT_DRAFT,
      recipients: "ops@example.com",
    }, runtime);

    expect(runtime.setPreview).not.toHaveBeenCalled();
    expect(runtime.setLastDeliveryResult).not.toHaveBeenCalled();
    expect(runtime.notify).not.toHaveBeenCalled();
    expect(runtime.setSaving).toHaveBeenLastCalledWith(false);
  });
});

function buildRuntime(isCurrent: () => boolean) {
  return {
    isCurrent,
    notify: vi.fn(),
    setLastDeliveryResult: vi.fn(),
    setPreview: vi.fn(),
    setSaving: vi.fn(),
  };
}
