import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/notifications/preview/route";
import { getSession } from "@/lib/auth/session";
import { buildMonitorForTest } from "@/lib/monitors/service";
import { DEFAULT_MONITOR_FORM } from "@/lib/monitors/types";
import { getSettings } from "@/lib/settings/service";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import { renderNotificationTemplates } from "@/worker/templates";
import { getWebhookEndpoint } from "@/lib/delivery/service";
import { evaluateNotificationDecision } from "@/worker/notifier";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/settings/service", () => ({ getSettings: vi.fn() }));
vi.mock("@/lib/monitors/service", () => ({ buildMonitorForTest: vi.fn() }));
vi.mock("@/worker/templates", () => ({ renderNotificationTemplates: vi.fn() }));
vi.mock("@/lib/delivery/service", () => ({ getWebhookEndpoint: vi.fn() }));
vi.mock("@/worker/notifier", () => ({ evaluateNotificationDecision: vi.fn() }));

describe("notification template preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    vi.mocked(getWebhookEndpoint).mockResolvedValueOnce(null as never);
    vi.mocked(evaluateNotificationDecision).mockResolvedValueOnce({
      wouldNotify: true,
      reason: "The confirmed failure is eligible for notification.",
    });

    const response = await POST(createRequest());
    const body = (await response.json()) as {
      preview: { subject: string };
      decision: { wouldNotify: boolean };
    };

    expect(response.status).toBe(200);
    expect(body.preview.subject).toBe("Example subject");
    expect(body.decision.wouldNotify).toBe(true);
    expect(evaluateNotificationDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "failure",
        monitor: expect.objectContaining({
          lastFailureAt: expect.any(Date),
        }),
      })
    );
    expect(renderNotificationTemplates).toHaveBeenCalledOnce();
  });

  it("suppresses HTTP failures that are explicitly configured as expected", async () => {
    vi.mocked(getSession).mockResolvedValueOnce({ id: "admin-1" } as never);
    vi.mocked(getSettings).mockResolvedValueOnce(DEFAULT_SETTINGS);
    vi.mocked(buildMonitorForTest).mockResolvedValueOnce({
      id: "preview-monitor",
      userId: "admin-1",
      name: "Example monitor",
      monitorType: "http",
      url: "https://example.com",
      status: "up",
      timeout: 60_000,
      slowResponseThresholdMs: 10_000,
      expectedStatusCodes: "500",
    } as never);
    vi.mocked(renderNotificationTemplates).mockReturnValueOnce({
      subject: "Example subject",
      textBody: "Example body",
      htmlBody: "<p>Example body</p>",
      telegramBody: "Example Telegram body",
    });
    vi.mocked(getWebhookEndpoint).mockResolvedValueOnce(null as never);

    const response = await POST(createRequest({ scenario: "http-500", kind: undefined }));
    const body = (await response.json()) as { decision: { wouldNotify: boolean; reason: string } };

    expect(response.status).toBe(200);
    expect(body.decision.wouldNotify).toBe(false);
    expect(body.decision.reason).toContain("configured as an expected response");
    expect(evaluateNotificationDecision).not.toHaveBeenCalled();
  });

  it("renders a slow-response sample strictly between its threshold and hard timeout", async () => {
    preparePreviewMocks({ timeout: 5_000, slowResponseThresholdMs: 2_000 });
    vi.mocked(evaluateNotificationDecision).mockResolvedValueOnce({
      wouldNotify: true,
      reason: "The slow response is eligible for notification.",
    });

    const response = await POST(createRequest({ scenario: "slow-response", kind: undefined }));

    expect(response.status).toBe(200);
    expect(renderNotificationTemplates).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "latency",
        result: expect.objectContaining({
          ok: true,
          status: "up",
          latencyMs: 4_500,
        }),
      }),
      DEFAULT_SETTINGS,
      expect.any(String)
    );
  });

  it("suppresses an unmeasurably narrow slow-response range", async () => {
    preparePreviewMocks({ timeout: 5_000, slowResponseThresholdMs: 4_999 });

    const response = await POST(createRequest({ scenario: "slow-response", kind: undefined }));
    const body = (await response.json()) as { decision: { wouldNotify: boolean; reason: string } };

    expect(response.status).toBe(200);
    expect(body.decision.wouldNotify).toBe(false);
    expect(body.decision.reason).toContain("measurable time");
    expect(evaluateNotificationDecision).not.toHaveBeenCalled();
  });
});

function preparePreviewMocks(overrides: { timeout: number; slowResponseThresholdMs: number }) {
  vi.mocked(getSession).mockResolvedValueOnce({ id: "admin-1" } as never);
  vi.mocked(getSettings).mockResolvedValueOnce(DEFAULT_SETTINGS);
  vi.mocked(buildMonitorForTest).mockResolvedValueOnce({
    id: "preview-monitor",
    userId: "admin-1",
    name: "Example monitor",
    monitorType: "http",
    url: "https://example.com",
    status: "up",
    expectedStatusCodes: "200",
    ...overrides,
  } as never);
  vi.mocked(renderNotificationTemplates).mockReturnValueOnce({
    subject: "Example subject",
    textBody: "Example body",
    htmlBody: "<p>Example body</p>",
    telegramBody: "Example Telegram body",
  });
  vi.mocked(getWebhookEndpoint).mockResolvedValueOnce(null as never);
}

function createRequest(overrides: Record<string, unknown> = {}) {
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
      ...overrides,
    }),
  });
}
