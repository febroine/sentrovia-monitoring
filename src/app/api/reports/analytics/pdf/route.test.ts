import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), generateReportPreview: vi.fn(), renderReportPdf: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/reports/service", () => ({ generateReportPreview: mocks.generateReportPreview }));
vi.mock("@/lib/reports/render-pdf", () => ({ renderReportPdf: mocks.renderReportPdf }));

import { POST } from "@/app/api/reports/analytics/pdf/route";

const request = (body: unknown) => new NextRequest("http://localhost/api/reports/analytics/pdf", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("analytics PDF route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "user-1", activeWorkspaceId: "workspace-1" });
    mocks.generateReportPreview.mockResolvedValue({ title: "Executive Analytics", generatedAt: "2026-09-16T00:00:00Z" });
    mocks.renderReportPdf.mockResolvedValue(Buffer.from("%PDF-1.4"));
  });

  it("renders filtered analytics as a downloadable PDF in the active workspace", async () => {
    const response = await POST(request({ companyId: "company-1", monitorIds: ["one", "two"], excludeMonitorIds: ["three"], periodRange: "30d" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("executive-analytics-2026-09-16.pdf");
    expect(response.headers.get("x-report-filename")).toBe("executive-analytics-2026-09-16.pdf");
    expect(await response.text()).toBe("%PDF-1.4");
    expect(mocks.generateReportPreview).toHaveBeenCalledWith("user-1", expect.objectContaining({
      scope: "company", cadence: "monthly", monitorIds: ["one", "two"], excludeMonitorIds: ["three"],
    }), expect.any(Date), "workspace-1");
  });

  it("rejects unauthorized or invalid requests without rendering", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request({}))).status).toBe(401);
    expect((await POST(request({ periodRange: "custom" }))).status).toBe(400);
    expect(mocks.renderReportPdf).not.toHaveBeenCalled();
  });
});
