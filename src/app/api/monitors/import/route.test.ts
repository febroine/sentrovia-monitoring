import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/lib/auth/errors";
import { hashSecretValue } from "@/lib/security/encryption";
import { buildHeartbeatMonitorTarget } from "@/lib/monitors/targets";

const mocks = vi.hoisted(() => ({
  createManyMonitors: vi.fn(),
  listReservedMonitorTargets: vi.fn(),
  assertMonitorNetworkTargetAllowed: vi.fn(),
  getSession: vi.fn(),
  getSettings: vi.fn(),
  importMonitorsWithHistory: vi.fn(),
}));

vi.mock("@/lib/security/network-policy", () => ({ canUserAccessPrivateTargets: vi.fn().mockResolvedValue(false) }));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/monitors/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/monitors/service")>()),
  createManyMonitors: mocks.createManyMonitors,
  listReservedMonitorTargets: mocks.listReservedMonitorTargets,
  assertMonitorNetworkTargetAllowed: mocks.assertMonitorNetworkTargetAllowed,
}));
vi.mock("@/lib/settings/service", () => ({ getSettings: mocks.getSettings }));
vi.mock("@/lib/monitors/import-history", () => ({ importMonitorsWithHistory: mocks.importMonitorsWithHistory }));

import { POST } from "@/app/api/monitors/import/route";

describe("monitor import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      id: "user-1",
      activeWorkspaceId: "workspace-1",
      role: "operator",
    });
    mocks.getSettings.mockResolvedValue(null);
    mocks.listReservedMonitorTargets.mockResolvedValue([]);
    mocks.assertMonitorNetworkTargetAllowed.mockResolvedValue(undefined);
    mocks.importMonitorsWithHistory.mockResolvedValue({ created: [], run: { id: "run-1" } });
  });

  it("reports the original CSV row number when blank rows were skipped", async () => {
    const response = await POST(buildRequest({
      monitors: [{ url: "example.com" }],
      lineNumbers: [4],
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      message: expect.stringContaining("Row 4:"),
    }));
    expect(mocks.createManyMonitors).not.toHaveBeenCalled();
  });

  it("previews valid, duplicate, and invalid rows without importing", async () => {
    mocks.listReservedMonitorTargets.mockResolvedValue([{ monitorType: "http", url: "https://existing.example" }]);
    const response = await POST(buildRequest({
      preview: true,
      monitors: [
        { name: "Existing", url: "https://existing.example" },
        { name: "New", url: "https://new.example" },
        { name: "Repeated", url: "https://new.example" },
        { url: "https://invalid.example" },
      ],
      lineNumbers: [2, 4, 5, 8],
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.preview).toMatchObject({ added: 1, skipped: 2, invalid: 1 });
    expect(body.preview.rows.map((row: { status: string; lineNumber: number }) => [row.lineNumber, row.status])).toEqual([
      [2, "skipped"], [4, "added"], [5, "skipped"], [8, "invalid"],
    ]);
    expect(mocks.createManyMonitors).not.toHaveBeenCalled();
  });

  it("does not mark a target blocked by the network policy as ready to import", async () => {
    mocks.assertMonitorNetworkTargetAllowed.mockRejectedValue(new AuthError("Monitor target is not allowed by the current network safety policy.", 400));
    const response = await POST(buildRequest({
      preview: true,
      monitors: [{ name: "Internal", url: "https://blocked.example/health" }],
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.preview).toMatchObject({ added: 0, invalid: 1 });
    expect(body.preview.rows[0].reason).toContain("network safety policy");
    expect(mocks.createManyMonitors).not.toHaveBeenCalled();
  });

  it("skips a heartbeat whose explicit token already belongs to a monitor", async () => {
    const token = "heartbeat-token-1234567890";
    mocks.listReservedMonitorTargets.mockResolvedValue([{
      monitorType: "heartbeat",
      url: buildHeartbeatMonitorTarget(hashSecretValue("heartbeat-token", token)),
    }]);
    const response = await POST(buildRequest({
      preview: true,
      monitors: [{ name: "Existing job", monitorType: "heartbeat", url: "heartbeat://existing", heartbeatToken: token }],
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.preview).toMatchObject({ added: 0, skipped: 1, invalid: 0 });
  });

  it("records a validated CSV import with its file name", async () => {
    const response = await POST(buildRequest({
      monitors: [{ name: "API", url: "https://api.example/health" }],
      fileName: "production.csv",
    }));

    expect(response.status).toBe(200);
    expect(mocks.importMonitorsWithHistory).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      workspaceId: "workspace-1",
      fileName: "production.csv",
      source: "csv",
    }));
  });
});

function buildRequest(body: unknown) {
  return new Request("http://localhost/api/monitors/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}
