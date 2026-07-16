import { beforeEach, describe, expect, it, vi } from "vitest";

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
});
