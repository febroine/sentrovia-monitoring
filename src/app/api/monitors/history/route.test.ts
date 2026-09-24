import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listRecentMonitorChecks: vi.fn(),
  listRecentMonitorDiagnostics: vi.fn(),
  listRecentOutageEvents: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/monitors/service", () => ({
  listRecentMonitorChecks: mocks.listRecentMonitorChecks,
  listRecentMonitorDiagnostics: mocks.listRecentMonitorDiagnostics,
  listRecentOutageEvents: mocks.listRecentOutageEvents,
}));

import { GET } from "@/app/api/monitors/history/route";

describe("monitor history route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "user-1", role: "admin" });
    mocks.listRecentMonitorChecks.mockResolvedValue({});
    mocks.listRecentMonitorDiagnostics.mockResolvedValue({});
    mocks.listRecentOutageEvents.mockResolvedValue({});
  });

  it("returns unauthorized without a session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("tolerates optional history tables missing on a legacy schema", async () => {
    mocks.listRecentMonitorDiagnostics.mockRejectedValue({ code: "42P01" });
    mocks.listRecentOutageEvents.mockRejectedValue({ cause: { code: "42703" } });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.diagnostics).toEqual({});
    expect(body.outageEvents).toEqual({});
  });

  it("does not hide database connectivity failures as empty history", async () => {
    mocks.listRecentMonitorDiagnostics.mockRejectedValue({ code: "ECONNREFUSED" });

    const response = await GET();

    expect(response.status).toBe(503);
  });

  it("loads history around a linked event instead of the latest checks", async () => {
    const response = await GET(new NextRequest("http://localhost/api/monitors/history?monitorId=monitor-1&at=2026-09-23T15%3A33%3A57.000Z"));

    expect(response.status).toBe(200);
    expect(mocks.listRecentMonitorChecks).toHaveBeenCalledWith(
      "user-1", 12, undefined, "monitor-1", new Date("2026-09-23T15:33:57.000Z")
    );
    expect(mocks.listRecentMonitorDiagnostics).toHaveBeenCalledWith(
      "user-1", 3, undefined, "monitor-1", new Date("2026-09-23T15:33:57.000Z")
    );
  });

  it("rejects an invalid linked event time", async () => {
    const response = await GET(new NextRequest("http://localhost/api/monitors/history?monitorId=monitor-1&at=invalid"));

    expect(response.status).toBe(400);
    expect(mocks.listRecentMonitorChecks).not.toHaveBeenCalled();
  });
});
