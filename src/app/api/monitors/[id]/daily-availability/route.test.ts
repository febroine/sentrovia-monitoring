import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSettings: vi.fn(),
  loadMonitorDailyAvailability: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/settings/service", () => ({ getSettings: mocks.getSettings }));
vi.mock("@/lib/monitors/daily-availability", () => ({ loadMonitorDailyAvailability: mocks.loadMonitorDailyAvailability }));

import { GET } from "@/app/api/monitors/[id]/daily-availability/route";

const MONITOR_ID = "6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d";

function call(id = MONITOR_ID) {
  return GET(new Request(`http://localhost/api/monitors/${id}/daily-availability`), { params: Promise.resolve({ id }) });
}

describe("daily availability route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "user-1", activeWorkspaceId: "workspace-1" });
    mocks.getSettings.mockResolvedValue({ appearance: { timeZone: "America/New_York", use24HourClock: true } });
    mocks.loadMonitorDailyAvailability.mockResolvedValue([{ date: "2026-10-02", hasData: true }]);
  });

  it("requires a session", async () => {
    mocks.getSession.mockResolvedValue(null);

    expect((await call()).status).toBe(401);
    expect(mocks.loadMonitorDailyAvailability).not.toHaveBeenCalled();
  });

  it("rejects a malformed monitor id", async () => {
    expect((await call("not-an-id")).status).toBe(400);
  });

  it("loads days in the workspace time zone from the active workspace", async () => {
    const response = await call();

    expect(response.status).toBe(200);
    expect(mocks.loadMonitorDailyAvailability).toHaveBeenCalledWith("workspace-1", MONITOR_ID, "America/New_York");
    await expect(response.json()).resolves.toEqual({ timeZone: "America/New_York", days: [{ date: "2026-10-02", hasData: true }] });
  });

  it("falls back to the default time zone when the setting is not valid", async () => {
    mocks.getSettings.mockResolvedValue({ appearance: { timeZone: "Mars/Olympus" } });

    await call();

    expect(mocks.loadMonitorDailyAvailability).toHaveBeenCalledWith("workspace-1", MONITOR_ID, "Europe/Istanbul");
  });

  it("answers 404 for a monitor outside the workspace", async () => {
    mocks.loadMonitorDailyAvailability.mockResolvedValue(null);

    expect((await call()).status).toBe(404);
  });
});
