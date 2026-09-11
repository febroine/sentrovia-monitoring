import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listMonitors: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/monitors/service", () => ({ listMonitors: mocks.listMonitors }));

import { GET } from "@/app/api/monitors/export/route";

describe("monitor export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      id: "user-1",
      role: "admin",
      activeWorkspaceId: "workspace-1",
    });
    mocks.listMonitors.mockResolvedValue([
      buildMonitor("11111111-1111-4111-8111-111111111111", "First monitor"),
      buildMonitor("22222222-2222-4222-8222-222222222222", "Second monitor"),
    ]);
  });

  it("exports only selected monitor IDs from the trusted workspace", async () => {
    const selectedId = "22222222-2222-4222-8222-222222222222";
    const response = await GET(new NextRequest(
      `http://localhost/api/monitors/export?format=json&scope=selected&id=${selectedId}`
    ));
    const rows = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toMatch(/sentrovia-monitors-selected-.*\.json/);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: selectedId, name: "Second monitor" });
    expect(mocks.listMonitors).toHaveBeenCalledWith("user-1", undefined, "workspace-1");
  });

  it("rejects an invalid selected monitor ID before querying", async () => {
    const response = await GET(new NextRequest(
      "http://localhost/api/monitors/export?format=csv&scope=selected&id=not-a-uuid"
    ));

    expect(response.status).toBe(400);
    expect(mocks.listMonitors).not.toHaveBeenCalled();
  });
});

function buildMonitor(id: string, name: string) {
  const timestamp = new Date("2026-09-11T08:00:00.000Z");
  return {
    id,
    name,
    monitorType: "http",
    url: "https://example.com/health",
    company: null,
    status: "up",
    statusCode: 200,
    uptime: "100.00%",
    isActive: true,
    publishOnStatusPage: false,
    isFavorite: false,
    isCritical: false,
    latencyMs: 100,
    intervalValue: 5,
    intervalUnit: "dk",
    timeout: 10_000,
    retries: 3,
    method: "GET",
    tags: [],
    notificationPref: "email",
    sendOutageScreenshot: true,
    lastCheckedAt: timestamp,
    lastSuccessAt: timestamp,
    lastFailureAt: null,
    sslExpiresAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
