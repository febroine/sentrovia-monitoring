import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Monitor } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  goto: vi.fn(),
  launch: vi.fn(),
  resolveTarget: vi.fn(),
  screenshot: vi.fn(),
}));

vi.mock("@/lib/security/public-network-target", () => ({
  normalizeNetworkHostname: (hostname: string) => hostname,
  resolveMonitorNetworkTargetWithTimeout: mocks.resolveTarget,
  selectResolvedAddress: () => "203.0.113.10",
}));

vi.mock("playwright", () => ({ chromium: { launch: mocks.launch } }));

import { buildFailureScreenshotAttachment } from "@/worker/screenshot";

describe("screenshot deadline", () => {
  beforeEach(() => {
    mocks.resolveTarget.mockImplementation(async (hostname: string) => ({
      hostname,
      addresses: [{ address: "203.0.113.10", family: 4 }],
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("closes a browser still navigating when the capture deadline expires", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let rejectNavigation: (error: Error) => void = () => undefined;
    mocks.goto.mockImplementation(() => new Promise<void>((_resolve, reject) => {
      rejectNavigation = reject;
    }));
    mocks.close.mockImplementation(async () => {
      rejectNavigation(new Error("Browser closed."));
    });
    mocks.launch.mockResolvedValue({
      newContext: async () => ({
        route: async () => undefined,
        newPage: async () => ({
          setDefaultTimeout: vi.fn(),
          setDefaultNavigationTimeout: vi.fn(),
          goto: mocks.goto,
          screenshot: mocks.screenshot,
        }),
      }),
      close: mocks.close,
    });

    const capture = buildFailureScreenshotAttachment({
      id: "monitor-1",
      name: "Website",
      monitorType: "http",
      url: "https://example.com",
      notificationPref: "email",
      sendOutageScreenshot: true,
      ignoreSslErrors: false,
    } as Monitor);
    await vi.waitFor(() => expect(mocks.goto).toHaveBeenCalledOnce());

    await vi.advanceTimersByTimeAsync(30_000);

    await expect(capture).resolves.toBeNull();
    expect(mocks.close).toHaveBeenCalled();
    expect(mocks.screenshot).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("screenshot capture timed out"));
  });

  it("captures a page when valid setup and navigation stages take more than 15 seconds together", async () => {
    vi.useFakeTimers();
    mocks.resolveTarget.mockImplementation(async (hostname: string) => {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      return { hostname, addresses: [{ address: "203.0.113.10", family: 4 }] };
    });
    mocks.launch.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      return {
        newContext: async () => ({
          route: async () => undefined,
          newPage: async () => ({
            setDefaultTimeout: vi.fn(),
            setDefaultNavigationTimeout: vi.fn(),
            goto: async () => { await new Promise((resolve) => setTimeout(resolve, 7_000)); },
            screenshot: async () => Buffer.from("image"),
          }),
        }),
        close: mocks.close,
      };
    });

    const capture = buildFailureScreenshotAttachment({
      id: "monitor-1",
      name: "Website",
      monitorType: "http",
      url: "https://example.com",
      notificationPref: "email",
      sendOutageScreenshot: true,
      ignoreSslErrors: false,
    } as Monitor);
    await vi.advanceTimersByTimeAsync(18_000);

    await expect(capture).resolves.toMatchObject({
      content: Buffer.from("image"),
      contentType: "image/jpeg",
    });
  });

  it("captures the visible browser frame when Playwright screenshot waits too long for fonts", async () => {
    const detach = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue({ data: Buffer.from("browser frame").toString("base64") });
    mocks.screenshot.mockRejectedValueOnce(new Error("page.screenshot: Timeout 12000ms exceeded"));
    mocks.close.mockResolvedValue(undefined);
    mocks.launch.mockResolvedValue({
      newContext: async () => ({
        route: async () => undefined,
        newPage: async () => ({
          setDefaultTimeout: vi.fn(),
          setDefaultNavigationTimeout: vi.fn(),
          goto: async () => undefined,
          screenshot: mocks.screenshot,
          url: () => "https://example.com/",
          evaluate: async () => true,
          context: () => ({ newCDPSession: async () => ({ send, detach }) }),
        }),
      }),
      close: mocks.close,
    });

    const attachment = await buildFailureScreenshotAttachment({
      id: "monitor-1",
      name: "Website",
      monitorType: "http",
      url: "https://example.com",
      notificationPref: "email",
      sendOutageScreenshot: true,
      ignoreSslErrors: false,
    } as Monitor);

    expect(attachment?.content).toEqual(Buffer.from("browser frame"));
    expect(send).toHaveBeenCalledWith("Page.captureScreenshot", expect.objectContaining({ format: "jpeg" }));
    expect(detach).toHaveBeenCalledOnce();
  });

});
