import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/dashboard/stream/route";
import { getSession } from "@/lib/auth/session";
import { getActiveSessionUser } from "@/lib/auth/service";
import { getDashboardData } from "@/lib/dashboard/service";

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/auth/service", () => ({
  getActiveSessionUser: vi.fn(),
}));

vi.mock("@/lib/dashboard/service", () => ({
  getDashboardData: vi.fn(),
}));

const session = {
  id: "user-1",
  firstName: "Test",
  lastName: "User",
  email: "test@example.com",
  department: null,
  role: "admin" as const,
  sessionVersion: 3,
};

describe("dashboard stream route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects requests without an active session", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const response = await GET(buildRequest());

    expect(response.status).toBe(401);
    expect(getDashboardData).not.toHaveBeenCalled();
  });

  it("closes the stream when the session version has been revoked", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(session);
    vi.mocked(getActiveSessionUser).mockResolvedValueOnce(null);

    const response = await GET(buildRequest());
    const reader = response.body?.getReader();
    const frame = await reader?.read();

    expect(response.status).toBe(200);
    expect(frame?.done).toBe(true);
    expect(getActiveSessionUser).toHaveBeenCalledWith(session.id, session.sessionVersion);
    expect(getDashboardData).not.toHaveBeenCalled();
  });

  it("sends dashboard data only after revalidating the session", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(session);
    vi.mocked(getActiveSessionUser).mockResolvedValueOnce(session);
    vi.mocked(getDashboardData).mockResolvedValueOnce({ summary: { total: 2 } } as never);

    const response = await GET(buildRequest());
    const reader = response.body?.getReader();
    const frame = await reader?.read();
    const body = frame?.value ? new TextDecoder().decode(frame.value) : "";

    expect(body).toContain('data: {"summary":{"total":2}}');
    expect(getActiveSessionUser).toHaveBeenCalledBefore(vi.mocked(getDashboardData));

    await reader?.cancel();
  });
});

function buildRequest() {
  return new NextRequest("http://localhost/api/dashboard/stream");
}
