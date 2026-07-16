import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/notifications/preview/route";
import { getSession } from "@/lib/auth/session";
import { buildMonitorForTest } from "@/lib/monitors/service";
import { DEFAULT_MONITOR_FORM } from "@/lib/monitors/types";
import { getSettings } from "@/lib/settings/service";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import { renderNotificationTemplates } from "@/worker/templates";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/settings/service", () => ({ getSettings: vi.fn() }));
vi.mock("@/lib/monitors/service", () => ({ buildMonitorForTest: vi.fn() }));
vi.mock("@/worker/templates", () => ({ renderNotificationTemplates: vi.fn() }));

describe("notification template preview route", () => {
  it("denies unauthenticated requests", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    expect(renderNotificationTemplates).not.toHaveBeenCalled();
  });

  it("renders templates without invoking a delivery channel", async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      id: "admin-1",
      firstName: "Admin",
      lastName: "User",
      email: "admin@example.com",
      department: null,
      role: "admin",
      sessionVersion: 1,
    });
    vi.mocked(getSettings).mockResolvedValueOnce(DEFAULT_SETTINGS);
    vi.mocked(buildMonitorForTest).mockResolvedValueOnce({
      id: "preview-monitor",
      name: "Example monitor",
      monitorType: "http",
      url: "https://example.com",
      timeout: 60_000,
      slowResponseThresholdMs: 10_000,
    } as never);
    vi.mocked(renderNotificationTemplates).mockReturnValueOnce({
      subject: "Example subject",
      textBody: "Example body",
      htmlBody: "<p>Example body</p>",
      telegramBody: "Example Telegram body",
    });

    const response = await POST(createRequest());
    const body = (await response.json()) as { preview: { subject: string } };

    expect(response.status).toBe(200);
    expect(body.preview.subject).toBe("Example subject");
    expect(renderNotificationTemplates).toHaveBeenCalledOnce();
  });
});

function createRequest() {
  return new NextRequest("http://localhost/api/notifications/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "failure",
      payload: {
        ...DEFAULT_MONITOR_FORM,
        name: "Example monitor",
        url: "https://example.com",
        notificationPref: "none",
      },
    }),
  });
}
