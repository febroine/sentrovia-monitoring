import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/monitors/test/route";
import { getSession } from "@/lib/auth/session";
import { DEFAULT_MONITOR_FORM } from "@/lib/monitors/types";
import { buildMonitorForTest } from "@/lib/monitors/service";
import { getSettings } from "@/lib/settings/service";
import { checkMonitor } from "@/worker/checker";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/settings/service", () => ({ getSettings: vi.fn() }));
vi.mock("@/lib/monitors/service", () => ({ buildMonitorForTest: vi.fn() }));
vi.mock("@/worker/checker", () => ({ checkMonitor: vi.fn() }));

describe("monitor connection test route", () => {
  it("denies unauthenticated requests before running a check", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    expect(checkMonitor).not.toHaveBeenCalled();
  });

  it("runs a check without persisting monitor state", async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      id: "user-1",
      firstName: "User",
      lastName: "One",
      email: "user@example.com",
      department: null,
      role: "admin",
      sessionVersion: 1,
    });
    vi.mocked(getSettings).mockResolvedValueOnce(null);
    vi.mocked(buildMonitorForTest).mockResolvedValueOnce({ id: "test-monitor" } as never);
    vi.mocked(checkMonitor).mockResolvedValueOnce({
      ok: true,
      status: "up",
      statusCode: 200,
      latencyMs: 140,
      errorMessage: null,
      failureReason: null,
      checkedAt: new Date("2026-07-16T09:00:00.000Z"),
      sslExpiresAt: null,
    });

    const response = await POST(createRequest());
    const body = (await response.json()) as { result: { ok: boolean; statusCode: number } };

    expect(response.status).toBe(200);
    expect(body.result).toMatchObject({ ok: true, statusCode: 200 });
    expect(buildMonitorForTest).toHaveBeenCalledOnce();
    expect(checkMonitor).toHaveBeenCalledOnce();
  });
});

function createRequest() {
  return new NextRequest("http://localhost/api/monitors/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payload: {
        ...DEFAULT_MONITOR_FORM,
        name: "Example monitor",
        url: "https://example.com",
        notificationPref: "none",
      },
    }),
  });
}
