import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateReportPreview: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/reports/service", () => ({ generateReportPreview: mocks.generateReportPreview }));

import { GET } from "@/app/api/reports/analytics/route";

describe("report analytics route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "user-1", role: "viewer", activeWorkspaceId: "workspace-1" });
    mocks.generateReportPreview.mockResolvedValue({ title: "Analytics" });
  });

  it("allows an authenticated viewer to request monitor analytics", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/reports/analytics?periodRange=30d&monitorId=monitor-1&timeZone=UTC&excludeMonitorIds=monitor-2&excludeMonitorIds=monitor-3&excludeTags=staging&excludeCompanyIds=company-2"
    ));

    expect(response.status).toBe(200);
    expect(mocks.generateReportPreview).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        scope: "global",
        cadence: "monthly",
        monitorId: "monitor-1",
        excludeMonitorIds: ["monitor-2", "monitor-3"],
        excludeTags: ["staging"],
        excludeCompanyIds: ["company-2"],
        periodRange: "30d",
        timeZone: "UTC",
      }),
      expect.any(Date),
      "workspace-1"
    );
  });

  it("rejects an invalid custom period before querying", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/reports/analytics?periodRange=custom&periodStartedAt=2026-09-11T00%3A00%3A00.000Z"
    ));

    expect(response.status).toBe(400);
    expect(mocks.generateReportPreview).not.toHaveBeenCalled();
  });
});
