import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getMonitorCheckEvidence: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/monitors/service", () => ({ getMonitorCheckEvidence: mocks.getMonitorCheckEvidence }));

import { GET } from "@/app/api/monitors/history/evidence/route";

describe("check evidence route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ id: "user-1", activeWorkspaceId: "workspace-1" });
    mocks.getMonitorCheckEvidence.mockResolvedValue({ version: 1, phase: "connect", hops: [] });
  });

  it("requires a session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/monitors/history/evidence?checkId=check-1"));

    expect(response.status).toBe(401);
    expect(mocks.getMonitorCheckEvidence).not.toHaveBeenCalled();
  });

  it("rejects a missing check id", async () => {
    const response = await GET(new NextRequest("http://localhost/api/monitors/history/evidence"));

    expect(response.status).toBe(400);
  });

  it("loads the evidence only from the active workspace", async () => {
    const response = await GET(new NextRequest("http://localhost/api/monitors/history/evidence?checkId=check-1"));

    expect(response.status).toBe(200);
    expect(mocks.getMonitorCheckEvidence).toHaveBeenCalledWith("workspace-1", "check-1");
    await expect(response.json()).resolves.toEqual({ evidence: { version: 1, phase: "connect", hops: [] } });
  });
});
