import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Monitor } from "@/lib/db/schema";
import { calculateVerificationTimeout } from "@/lib/monitors/verification";
import type { NotificationContext } from "@/worker/types";

type CheckResult = {
  ok: boolean;
  status: "up" | "down";
  statusCode: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
  failureReason?: null | "timeout" | "http_status" | "dns" | "tls" | "connection" | "assertion" | "redirect" | "network" | "database";
  checkedAt: Date;
  sslExpiresAt: Date | null;
};

const mocks = vi.hoisted(() => ({
  dueMonitors: [] as Monitor[],
  checkResult: {
    ok: false,
    status: "down" as "up" | "down",
    statusCode: 500,
    latencyMs: 120,
    errorMessage: "HTTP 500" as string | null,
    failureReason: "http_status" as null | "timeout" | "http_status" | "dns" | "tls" | "connection" | "assertion" | "redirect" | "network" | "database",
    checkedAt: new Date("2026-05-08T07:00:00.000Z"),
    sslExpiresAt: null,
  } as CheckResult,
  checkResults: [] as CheckResult[],
  checkMonitor: vi.fn(),
  appendOutageEvent: vi.fn(),
  appendMonitorCheck: vi.fn(),
  appendMonitorDiagnostic: vi.fn(),
  appendMonitorEvent: vi.fn(),
  claimDueMonitors: vi.fn(),
  countDueMonitors: vi.fn(),
  incrementWorkerCheckedCount: vi.fn(),
  isMonitorActive: vi.fn(),
  openOrUpdateOutage: vi.fn(),
  recordMonitorResult: vi.fn(),
  releaseMonitorLease: vi.fn(),
  recordWorkerCycleMetric: vi.fn(),
  resolveOutage: vi.fn(),
  sendMonitorNotifications: vi.fn(),
  buildFailureScreenshotAttachment: vi.fn(),
  updateWorkerState: vi.fn(),
  runMonitorDiagnostics: vi.fn(),
  ensureWorkerConnectivity: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    workerConcurrency: 20,
    workerPollIntervalMs: 10_000,
  },
}));

vi.mock("@/lib/outages/service", () => ({
  openOrUpdateOutage: mocks.openOrUpdateOutage,
  resolveOutage: mocks.resolveOutage,
}));

vi.mock("@/lib/diagnostics/service", () => ({
  runMonitorDiagnostics: mocks.runMonitorDiagnostics,
}));

vi.mock("@/lib/monitoring/rca", () => ({
  analyzeRootCause: () => ({
    type: "http-server",
    title: "Server Error",
    summary: "Server failed",
    details: "HTTP 500",
  }),
}));

vi.mock("@/lib/monitors/service", () => ({
  appendOutageEvent: mocks.appendOutageEvent,
  appendMonitorCheck: mocks.appendMonitorCheck,
  appendMonitorDiagnostic: mocks.appendMonitorDiagnostic,
  appendMonitorEvent: mocks.appendMonitorEvent,
  claimDueMonitors: mocks.claimDueMonitors,
  countDueMonitors: mocks.countDueMonitors,
  incrementWorkerCheckedCount: mocks.incrementWorkerCheckedCount,
  isMonitorActive: mocks.isMonitorActive,
  recordMonitorResult: mocks.recordMonitorResult,
  releaseMonitorLease: mocks.releaseMonitorLease,
  updateWorkerState: mocks.updateWorkerState,
}));

vi.mock("@/lib/worker/observability", () => ({
  recordWorkerCycleMetric: mocks.recordWorkerCycleMetric,
}));

vi.mock("@/worker/checker", () => ({
  calculateNextCheckAt: (monitor: Monitor, checkedAt: Date) =>
    new Date(checkedAt.getTime() + monitor.intervalValue * 60_000),
  calculateVerificationCheckAt: (checkedAt: Date) => new Date(checkedAt.getTime() + 60_000),
  checkMonitor: mocks.checkMonitor,
}));

vi.mock("@/worker/notifier", () => ({
  sendMonitorNotifications: mocks.sendMonitorNotifications,
}));

vi.mock("@/worker/connectivity", () => ({
  ensureWorkerConnectivity: mocks.ensureWorkerConnectivity,
}));

vi.mock("@/worker/screenshot", () => ({
  buildFailureScreenshotAttachment: mocks.buildFailureScreenshotAttachment,
}));

import { runMonitoringCycle } from "@/worker/scheduler";

describe("monitoring scheduler verification flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkResult = {
      ok: false,
      status: "down",
      statusCode: 500,
      latencyMs: 120,
      errorMessage: "HTTP 500",
      failureReason: "http_status",
      checkedAt: new Date("2026-05-08T07:00:00.000Z"),
      sslExpiresAt: null,
    };
    mocks.checkResults = [];
    mocks.dueMonitors = [];
    mocks.claimDueMonitors.mockImplementation(() => Promise.resolve(mocks.dueMonitors));
    mocks.checkMonitor.mockImplementation(() => {
      const nextResult = mocks.checkResults.shift();
      if (nextResult) {
        mocks.checkResult = nextResult;
      }
      return Promise.resolve(mocks.checkResult);
    });
    mocks.countDueMonitors.mockImplementation(() => Promise.resolve(mocks.dueMonitors.length));
    mocks.appendOutageEvent.mockResolvedValue(null);
    mocks.appendMonitorDiagnostic.mockResolvedValue(null);
    mocks.incrementWorkerCheckedCount.mockResolvedValue(null);
    mocks.isMonitorActive.mockResolvedValue(true);
    mocks.recordMonitorResult.mockResolvedValue({ id: "monitor-1" } as Monitor);
    mocks.releaseMonitorLease.mockResolvedValue(true);
    mocks.recordWorkerCycleMetric.mockResolvedValue(null);
    mocks.buildFailureScreenshotAttachment.mockResolvedValue(null);
    mocks.runMonitorDiagnostics.mockResolvedValue({
      status: "failed",
      failedPhase: "http",
      failureCategory: "http_error",
      summary: "HTTP diagnostics failed.",
      dnsStatus: "ok",
      resolvedIps: ["203.0.113.10"],
      tcpStatus: "ok",
      tlsStatus: "ok",
      httpStatus: "failed",
      httpStatusCode: 500,
      responseTimeMs: 100,
      timeoutMs: 3000,
      errorMessage: "HTTP 500",
      createdAt: new Date("2026-05-08T07:00:00.000Z"),
    });
    mocks.updateWorkerState.mockResolvedValue(null);
    mocks.sendMonitorNotifications.mockResolvedValue(false);
    mocks.ensureWorkerConnectivity.mockResolvedValue({
      available: true,
      status: "online",
      checkedAt: new Date("2026-05-08T07:00:00.000Z"),
      successfulTargets: 3,
      totalTargets: 3,
      message: "Internet connectivity confirmed.",
    });
  });

  it("schedules failed first verification attempts one minute later", async () => {
    mocks.dueMonitors = [buildMonitor({ status: "up", retries: 3 })];

    await runMonitoringCycle();

    expect(mocks.recordMonitorResult).toHaveBeenCalledWith(
      "monitor-1",
      expect.objectContaining({
        status: "pending",
        nextCheckAt: new Date("2026-05-08T07:01:00.000Z"),
        verificationMode: true,
        verificationFailureCount: 1,
      }),
      "lease-1"
    );
    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalled();
  });

  it("records diagnostics and outage timeline events for failed verification attempts", async () => {
    mocks.dueMonitors = [buildMonitor({ status: "up", retries: 3 })];

    await runMonitoringCycle();

    expect(mocks.runMonitorDiagnostics).toHaveBeenCalledWith(expect.objectContaining({ id: "monitor-1" }));
    expect(mocks.appendMonitorDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        monitorId: "monitor-1",
        userId: "user-1",
        diagnostic: expect.objectContaining({ failedPhase: "http" }),
      })
    );
    expect(mocks.appendOutageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "verification_started" })
    );
    expect(mocks.appendOutageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "diagnostic_completed" })
    );
  });

  it("does not re-confirm an already down monitor while retrying an unsent outage notification", async () => {
    mocks.dueMonitors = [
      buildMonitor({
        status: "down",
        retries: 1,
        consecutiveFailures: 4,
        lastFailureAt: new Date("2026-05-08T06:55:00.000Z"),
      }),
    ];

    await runMonitoringCycle();

    expect(mocks.recordMonitorResult).toHaveBeenCalledWith(
      "monitor-1",
      expect.objectContaining({
        status: "down",
        nextCheckAt: new Date("2026-05-08T07:05:00.000Z"),
        verificationMode: false,
        verificationFailureCount: 0,
      }),
      "lease-1"
    );
    expect(mocks.sendMonitorNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "failure" })
    );
    expect(mocks.appendOutageEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "outage_confirmed" })
    );
  });

  it("marks a retried outage notification and avoids a same-cycle downtime reminder", async () => {
    mocks.dueMonitors = [
      buildMonitor({
        status: "down",
        consecutiveFailures: 4,
        lastFailureAt: new Date("2026-05-08T06:55:00.000Z"),
      }),
    ];
    mocks.sendMonitorNotifications.mockResolvedValue(true);

    await runMonitoringCycle();

    expect(mocks.appendMonitorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "failure-notification", status: "down" })
    );
    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "downtime-reminder" })
    );
  });

  it("sends recovery without a duplicate status-change notification", async () => {
    mocks.checkResult = {
      ok: true,
      status: "up",
      statusCode: 200,
      latencyMs: 95,
      errorMessage: null,
      failureReason: null,
      checkedAt: new Date("2026-05-08T07:00:00.000Z"),
      sslExpiresAt: null,
    };
    mocks.dueMonitors = [
      buildMonitor({
        status: "down",
        statusCode: 500,
        lastFailureAt: new Date("2026-05-08T06:55:00.000Z"),
      }),
    ];
    mocks.sendMonitorNotifications.mockResolvedValue(true);

    await runMonitoringCycle();

    expect(mocks.sendMonitorNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "recovery" })
    );
    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "status-change" })
    );
    expect(mocks.recordMonitorResult).toHaveBeenCalledWith(
      "monitor-1",
      expect.objectContaining({
        status: "up",
        lastFailureAt: null,
      }),
      "lease-1"
    );
  });

  it("keeps slow successful responses online and sends a latency warning", async () => {
    mocks.sendMonitorNotifications.mockResolvedValue(true);
    mocks.checkResult = {
      ok: true,
      status: "up",
      statusCode: 200,
      latencyMs: 21,
      errorMessage: null,
      failureReason: null,
      checkedAt: new Date("2026-05-08T07:00:00.000Z"),
      sslExpiresAt: null,
    };
    mocks.dueMonitors = [
      buildMonitor({
        status: "up",
        notificationPref: "email",
        slowResponseThresholdMs: 20,
      }),
    ];

    await runMonitoringCycle();

    expect(mocks.recordMonitorResult).toHaveBeenCalledWith(
      "monitor-1",
      expect.objectContaining({
        status: "up",
        verificationMode: false,
        verificationFailureCount: 0,
        latencyMs: 21,
      }),
      "lease-1"
    );
    expect(mocks.appendMonitorCheck).toHaveBeenCalledWith(
      expect.objectContaining({ status: "up", latencyMs: 21 })
    );
    expect(mocks.appendMonitorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "latency",
        status: "up",
        message: "Service is online but slow: 21ms exceeded the 20ms threshold.",
      })
    );
    expect(mocks.sendMonitorNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "latency" })
    );
    expect(mocks.appendMonitorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "latency-notification", status: "up" })
    );
    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "failure" })
    );
  });

  it("records first slow response without sending a latency notification", async () => {
    mocks.checkResult = {
      ok: true,
      status: "up",
      statusCode: 200,
      latencyMs: 21,
      errorMessage: null,
      failureReason: null,
      checkedAt: new Date("2026-05-08T07:00:00.000Z"),
      sslExpiresAt: null,
    };
    mocks.dueMonitors = [
      buildMonitor({
        status: "up",
        latencyMs: 10,
        notificationPref: "email",
        slowResponseThresholdMs: 20,
      }),
    ];

    await runMonitoringCycle();

    expect(mocks.appendMonitorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "latency",
        status: "up",
        message: "Service is online but slow: 21ms exceeded the 20ms threshold.",
      })
    );
    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "latency" })
    );
  });

  it("does not count a pending timeout latency as a previous slow success", async () => {
    mocks.checkResult = {
      ok: true,
      status: "up",
      statusCode: 200,
      latencyMs: 21,
      errorMessage: null,
      failureReason: null,
      checkedAt: new Date("2026-05-08T07:00:00.000Z"),
      sslExpiresAt: null,
    };
    mocks.dueMonitors = [
      buildMonitor({
        status: "pending",
        verificationMode: true,
        verificationFailureCount: 1,
        latencyMs: 5000,
        notificationPref: "email",
        slowResponseThresholdMs: 20,
      }),
    ];

    await runMonitoringCycle();

    expect(mocks.appendMonitorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "latency", status: "up" })
    );
    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "latency" })
    );
  });

  it("records slow responses without notifying when monitor slow alerts are disabled", async () => {
    mocks.checkResult = {
      ok: true,
      status: "up",
      statusCode: 200,
      latencyMs: 21,
      errorMessage: null,
      failureReason: null,
      checkedAt: new Date("2026-05-08T07:00:00.000Z"),
      sslExpiresAt: null,
    };
    mocks.dueMonitors = [
      buildMonitor({
        status: "up",
        latencyMs: 25,
        notificationPref: "email",
        slowResponseThresholdMs: 20,
        slowResponseAlertsEnabled: false,
      }),
    ];

    await runMonitoringCycle();

    expect(mocks.appendMonitorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "latency",
        status: "up",
      })
    );
    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "latency" })
    );
  });

  it("sends and records an approaching SSL certificate expiry warning", async () => {
    mocks.sendMonitorNotifications.mockResolvedValue(true);
    mocks.checkResult = {
      ok: true,
      status: "up",
      statusCode: 200,
      latencyMs: 80,
      errorMessage: null,
      failureReason: null,
      checkedAt: new Date("2026-05-08T07:00:00.000Z"),
      sslExpiresAt: new Date("2026-05-18T07:00:00.000Z"),
    };
    mocks.dueMonitors = [
      buildMonitor({
        status: "up",
        statusCode: 200,
        notificationPref: "email",
        checkSslExpiry: true,
      }),
    ];

    await runMonitoringCycle();

    expect(mocks.sendMonitorNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "ssl-expiry",
        message: "TLS certificate expires in 10 days on 2026-05-18.",
      })
    );
    expect(mocks.appendMonitorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "ssl-expiry",
        status: "up",
        message: "TLS certificate expires in 10 days on 2026-05-18.",
      })
    );
    expect(mocks.appendMonitorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "ssl-expiry-notification", status: "up" })
    );
  });

  it("does not warn when the SSL certificate is outside the expiry window", async () => {
    mocks.checkResult = {
      ok: true,
      status: "up",
      statusCode: 200,
      latencyMs: 80,
      errorMessage: null,
      failureReason: null,
      checkedAt: new Date("2026-05-08T07:00:00.000Z"),
      sslExpiresAt: new Date("2026-07-08T07:00:00.000Z"),
    };
    mocks.dueMonitors = [buildMonitor({ status: "up", statusCode: 200, checkSslExpiry: true })];

    await runMonitoringCycle();

    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "ssl-expiry" })
    );
    expect(mocks.appendMonitorEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "ssl-expiry" })
    );
  });

  it("sends confirmed timeout failures with timeout-specific language", async () => {
    mocks.checkResults = [
      {
        ok: false,
        status: "down",
        statusCode: null,
        latencyMs: 7500,
        errorMessage: "Service did not respond within 7.5s.",
        failureReason: "timeout",
        checkedAt: new Date("2026-05-08T07:00:01.000Z"),
        sslExpiresAt: null,
      },
    ];
    mocks.dueMonitors = [
      buildMonitor({
        status: "pending",
        statusCode: 200,
        retries: 2,
        verificationMode: true,
        verificationFailureCount: 1,
        consecutiveFailures: 1,
        lastFailureAt: new Date("2026-05-08T06:59:00.000Z"),
      }),
    ];

    await runMonitoringCycle();

    expect(mocks.openOrUpdateOutage).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: null,
        errorMessage: "Service did not respond within 7.5s.",
      })
    );
    expect(mocks.appendOutageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "outage_confirmed",
        detail: "Service did not respond within 7.5s.",
        metadata: expect.objectContaining({ failureReason: "timeout" }),
      })
    );
    expect(mocks.sendMonitorNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "failure",
        message: "Service did not respond within 7.5s.",
      })
    );
  });

  it("sends confirmed failure without a duplicate status-change notification", async () => {
    mocks.checkResults = [
      {
        ok: false,
        status: "down",
        statusCode: 500,
        latencyMs: 130,
        errorMessage: "HTTP 500",
        checkedAt: new Date("2026-05-08T07:00:01.000Z"),
        sslExpiresAt: null,
      },
    ];
    mocks.dueMonitors = [
      buildMonitor({
        status: "pending",
        statusCode: 200,
        retries: 2,
        verificationMode: true,
        verificationFailureCount: 1,
        consecutiveFailures: 1,
      }),
    ];

    await runMonitoringCycle();

    expect(mocks.sendMonitorNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "failure" })
    );
    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "status-change" })
    );
  });

  it("attaches a screenshot to confirmed down notifications when capture succeeds", async () => {
    const screenshot = {
      filename: "sentrovia-api.jpg",
      content: Buffer.from("image"),
      contentType: "image/jpeg",
    };
    mocks.buildFailureScreenshotAttachment.mockResolvedValue(screenshot);
    mocks.checkResults = [
      {
        ok: false,
        status: "down",
        statusCode: 500,
        latencyMs: 130,
        errorMessage: "HTTP 500",
        checkedAt: new Date("2026-05-08T07:00:01.000Z"),
        sslExpiresAt: null,
      },
    ];
    mocks.dueMonitors = [
      buildMonitor({
        status: "pending",
        statusCode: 200,
        retries: 2,
        verificationMode: true,
        verificationFailureCount: 1,
        consecutiveFailures: 1,
      }),
    ];

    await runMonitoringCycle();

    const notificationContext = getNotificationContext("failure");
    expect(notificationContext.emailAttachments).toBeUndefined();
    expect(notificationContext.buildEmailAttachments).toEqual(expect.any(Function));
    expect(mocks.buildFailureScreenshotAttachment).not.toHaveBeenCalled();

    await expect(notificationContext.buildEmailAttachments?.()).resolves.toEqual([screenshot]);
    expect(mocks.buildFailureScreenshotAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ id: "monitor-1" }),
      new Date("2026-05-08T07:00:01.000Z"),
      expect.any(Function)
    );
  });

  it("records a monitor event when screenshot capture is skipped", async () => {
    mocks.buildFailureScreenshotAttachment.mockImplementation(async (_monitor, _checkedAt, onSkipped) => {
      onSkipped?.("screenshot queue timed out");
      return null;
    });
    mocks.checkResults = [
      {
        ok: false,
        status: "down",
        statusCode: 500,
        latencyMs: 130,
        errorMessage: "HTTP 500",
        checkedAt: new Date("2026-05-08T07:00:01.000Z"),
        sslExpiresAt: null,
      },
    ];
    mocks.dueMonitors = [
      buildMonitor({
        status: "pending",
        statusCode: 200,
        retries: 2,
        verificationMode: true,
        verificationFailureCount: 1,
        consecutiveFailures: 1,
        sendOutageScreenshot: true,
      }),
    ];

    await runMonitoringCycle();

    const notificationContext = getNotificationContext("failure");
    await expect(notificationContext.buildEmailAttachments?.()).resolves.toBeUndefined();
    expect(mocks.appendMonitorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "screenshot-skipped",
        message: "Failure screenshot skipped: screenshot queue timed out",
      })
    );
  });

  it("attaches a screenshot to downtime reminder notifications when capture succeeds", async () => {
    const screenshot = {
      filename: "sentrovia-api-reminder.jpg",
      content: Buffer.from("image"),
      contentType: "image/jpeg",
    };
    mocks.buildFailureScreenshotAttachment.mockResolvedValue(screenshot);
    mocks.dueMonitors = [
      buildMonitor({
        status: "down",
        notificationPref: "email",
        sendOutageScreenshot: true,
        consecutiveFailures: 4,
        lastFailureAt: new Date("2026-05-08T06:00:00.000Z"),
      }),
    ];

    await runMonitoringCycle();

    const notificationContext = getNotificationContext("downtime-reminder");
    expect(notificationContext.emailAttachments).toBeUndefined();
    expect(notificationContext.buildEmailAttachments).toEqual(expect.any(Function));
    expect(mocks.buildFailureScreenshotAttachment).not.toHaveBeenCalled();

    await expect(notificationContext.buildEmailAttachments?.()).resolves.toEqual([screenshot]);
    expect(mocks.buildFailureScreenshotAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ id: "monitor-1" }),
      new Date("2026-05-08T07:00:00.000Z"),
      expect.any(Function)
    );
  });

  it("attaches a screenshot to status-change notifications when capture succeeds", async () => {
    const screenshot = {
      filename: "sentrovia-api-status-change.jpg",
      content: Buffer.from("image"),
      contentType: "image/jpeg",
    };
    mocks.buildFailureScreenshotAttachment.mockResolvedValue(screenshot);
    mocks.checkResult = {
      ok: true,
      status: "up",
      statusCode: 204,
      latencyMs: 90,
      errorMessage: null,
      failureReason: null,
      checkedAt: new Date("2026-05-08T07:00:00.000Z"),
      sslExpiresAt: null,
    };
    mocks.dueMonitors = [
      buildMonitor({
        status: "up",
        statusCode: 200,
        notificationPref: "email",
        sendOutageScreenshot: true,
      }),
    ];

    await runMonitoringCycle();

    const notificationContext = getNotificationContext("status-change");
    expect(notificationContext.emailAttachments).toBeUndefined();
    expect(notificationContext.buildEmailAttachments).toEqual(expect.any(Function));
    expect(mocks.buildFailureScreenshotAttachment).not.toHaveBeenCalled();

    await expect(notificationContext.buildEmailAttachments?.()).resolves.toEqual([screenshot]);
    expect(mocks.buildFailureScreenshotAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ id: "monitor-1" }),
      new Date("2026-05-08T07:00:00.000Z"),
      expect.any(Function)
    );
  });

  it("does not send a down alert when final verification already recovered", async () => {
    mocks.checkResults = [
      {
        ok: true,
        status: "up",
        statusCode: 200,
        latencyMs: 80,
        errorMessage: null,
        checkedAt: new Date("2026-05-08T07:00:00.000Z"),
        sslExpiresAt: null,
      },
    ];
    mocks.dueMonitors = [
      buildMonitor({
        status: "pending",
        retries: 2,
        verificationMode: true,
        verificationFailureCount: 1,
        consecutiveFailures: 1,
        lastFailureAt: new Date("2026-05-08T06:59:00.000Z"),
      }),
    ];

    await runMonitoringCycle();

    expect(mocks.recordMonitorResult).toHaveBeenCalledWith(
      "monitor-1",
      expect.objectContaining({
        status: "up",
        nextCheckAt: new Date("2026-05-08T07:05:00.000Z"),
        lastFailureAt: null,
        verificationMode: false,
        verificationFailureCount: 0,
        consecutiveFailures: 0,
      }),
      "lease-1"
    );
    expect(mocks.incrementWorkerCheckedCount).toHaveBeenCalledWith(1);
    expect(mocks.appendMonitorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "verification",
        status: "up",
        message: "Verification recovered before outage confirmation.",
      })
    );
    expect(mocks.appendOutageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "verification_recovered",
        title: "Verification recovered",
      })
    );
    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "failure" })
    );
  });

  it("rechecks the final failed verification and suppresses a stale outage when the service recovers", async () => {
    mocks.checkResults = [
      {
        ok: false,
        status: "down",
        statusCode: null,
        latencyMs: 7500,
        errorMessage: "Connection failed before the service returned a response.",
        failureReason: "connection",
        checkedAt: new Date("2026-05-08T07:00:00.000Z"),
        sslExpiresAt: null,
      },
      {
        ok: true,
        status: "up",
        statusCode: 200,
        latencyMs: 90,
        errorMessage: null,
        failureReason: null,
        checkedAt: new Date("2026-05-08T07:00:02.000Z"),
        sslExpiresAt: null,
      },
    ];
    mocks.dueMonitors = [
      buildMonitor({
        status: "pending",
        retries: 2,
        verificationMode: true,
        verificationFailureCount: 1,
        consecutiveFailures: 1,
        lastFailureAt: new Date("2026-05-08T06:59:00.000Z"),
      }),
    ];

    await runMonitoringCycle();

    expect(mocks.checkMonitor).toHaveBeenCalledTimes(2);
    expect(mocks.incrementWorkerCheckedCount).toHaveBeenCalledWith(2);
    expect(mocks.recordMonitorResult).toHaveBeenCalledWith(
      "monitor-1",
      expect.objectContaining({
        status: "up",
        statusCode: 200,
        lastFailureAt: null,
        verificationMode: false,
        verificationFailureCount: 0,
        consecutiveFailures: 0,
      }),
      "lease-1"
    );
    expect(mocks.appendOutageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "verification_recovered",
        detail: "Final confirmation recovered before outage confirmation.",
        metadata: expect.objectContaining({ recoveredDuringFinalConfirmation: true }),
      })
    );
    expect(mocks.openOrUpdateOutage).not.toHaveBeenCalled();
    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "failure" })
    );
    expect(mocks.buildFailureScreenshotAttachment).not.toHaveBeenCalled();
  });

  it("confirms an outage only after the final probe fails and reports the latest failure", async () => {
    mocks.checkResults = [
      {
        ok: false,
        status: "down",
        statusCode: null,
        latencyMs: 120,
        errorMessage: "Connection failed before the service returned a response.",
        failureReason: "connection",
        checkedAt: new Date("2026-05-08T07:00:00.000Z"),
        sslExpiresAt: null,
      },
      {
        ok: false,
        status: "down",
        statusCode: null,
        latencyMs: 10_000,
        errorMessage: "Service did not respond within 10s.",
        failureReason: "timeout",
        checkedAt: new Date("2026-05-08T07:00:10.000Z"),
        sslExpiresAt: null,
      },
    ];
    mocks.dueMonitors = [
      buildMonitor({
        status: "pending",
        retries: 2,
        verificationMode: true,
        verificationFailureCount: 1,
        consecutiveFailures: 1,
        lastFailureAt: new Date("2026-05-08T06:59:00.000Z"),
      }),
    ];

    await runMonitoringCycle();

    expect(mocks.checkMonitor).toHaveBeenCalledTimes(2);
    expect(mocks.recordMonitorResult).toHaveBeenCalledWith(
      "monitor-1",
      expect.objectContaining({
        status: "down",
        lastCheckedAt: new Date("2026-05-08T07:00:10.000Z"),
        lastErrorMessage: "Service did not respond within 10s.",
        verificationMode: false,
      }),
      "lease-1"
    );
    expect(mocks.openOrUpdateOutage).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: "Service did not respond within 10s." })
    );
    expect(mocks.sendMonitorNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "failure",
        message: "Service did not respond within 10s.",
        result: expect.objectContaining({ failureReason: "timeout" }),
      })
    );
  });

  it("releases the monitor without changing state or notifying when internet connectivity is unavailable", async () => {
    mocks.ensureWorkerConnectivity.mockResolvedValue({
      available: false,
      status: "offline",
      checkedAt: new Date("2026-05-08T07:00:01.000Z"),
      successfulTargets: 0,
      totalTargets: 3,
      message: "Internet connectivity unavailable.",
    });
    mocks.dueMonitors = [
      buildMonitor({
        status: "pending",
        retries: 2,
        verificationMode: true,
        verificationFailureCount: 1,
        consecutiveFailures: 1,
        lastFailureAt: new Date("2026-05-08T06:59:00.000Z"),
      }),
    ];

    await runMonitoringCycle();

    expect(mocks.checkMonitor).toHaveBeenCalledTimes(1);
    expect(mocks.releaseMonitorLease).toHaveBeenCalledWith("monitor-1", "lease-1");
    expect(mocks.recordMonitorResult).not.toHaveBeenCalled();
    expect(mocks.appendMonitorCheck).not.toHaveBeenCalled();
    expect(mocks.openOrUpdateOutage).not.toHaveBeenCalled();
    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalled();
  });

  it("holds the monitor lease until persistence and notification side effects finish", async () => {
    mocks.sendMonitorNotifications.mockResolvedValue(true);
    mocks.dueMonitors = [
      buildMonitor({
        status: "pending",
        retries: 2,
        verificationMode: true,
        verificationFailureCount: 1,
        consecutiveFailures: 1,
      }),
    ];

    await runMonitoringCycle();

    const releaseOrder = mocks.releaseMonitorLease.mock.invocationCallOrder[0];
    const resultOrder = mocks.recordMonitorResult.mock.invocationCallOrder[0];
    const notificationOrder = mocks.sendMonitorNotifications.mock.invocationCallOrder[0];
    expect(releaseOrder).toBeGreaterThan(resultOrder);
    expect(releaseOrder).toBeGreaterThan(notificationOrder);
  });

  it("releases the monitor lease when a check throws unexpectedly", async () => {
    mocks.checkMonitor.mockRejectedValueOnce(new Error("Checker crashed."));
    mocks.dueMonitors = [buildMonitor()];

    await runMonitoringCycle();

    expect(mocks.releaseMonitorLease).toHaveBeenCalledWith("monitor-1", "lease-1");
    expect(mocks.recordWorkerCycleMetric).toHaveBeenCalledWith(
      expect.objectContaining({ claimedMonitors: 1, completedMonitors: 0, errorMessage: "Checker crashed." })
    );
  });

  it("uses longer timeouts for verification rechecks", async () => {
    mocks.dueMonitors = [
      buildMonitor({
        status: "pending",
        timeout: 5000,
        retries: 3,
        verificationMode: true,
        verificationFailureCount: 1,
        consecutiveFailures: 1,
      }),
    ];

    await runMonitoringCycle();

    expect(mocks.checkMonitor).toHaveBeenCalledWith(expect.objectContaining({ timeout: 7500 }));
  });

  it("uses the capped escalation for the final configured verification attempt", async () => {
    mocks.dueMonitors = [
      buildMonitor({
        status: "pending",
        timeout: 5000,
        retries: 3,
        verificationMode: true,
        verificationFailureCount: 2,
        consecutiveFailures: 2,
      }),
    ];

    await runMonitoringCycle();

    expect(mocks.checkMonitor).toHaveBeenCalledTimes(2);
    expect(mocks.checkMonitor).toHaveBeenNthCalledWith(1, expect.objectContaining({ timeout: 10000 }));
    expect(mocks.checkMonitor).toHaveBeenNthCalledWith(2, expect.objectContaining({ timeout: 10000 }));
  });

  it("does not write events or notifications when a claimed monitor was paused mid-cycle", async () => {
    mocks.recordMonitorResult.mockResolvedValue(null);
    mocks.dueMonitors = [buildMonitor({ status: "up", retries: 3 })];

    await runMonitoringCycle();

    expect(mocks.appendMonitorCheck).not.toHaveBeenCalled();
    expect(mocks.appendMonitorEvent).not.toHaveBeenCalled();
    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalled();
    expect(mocks.recordWorkerCycleMetric).toHaveBeenCalledWith(
      expect.objectContaining({ claimedMonitors: 1, completedMonitors: 0 })
    );
    expect(mocks.updateWorkerState).toHaveBeenLastCalledWith(
      expect.objectContaining({ statusMessage: "Completed 0 of 1 monitor check(s)." })
    );
  });

  it("does not write side effects when a monitor is paused after result persistence", async () => {
    mocks.isMonitorActive.mockResolvedValue(false);
    mocks.dueMonitors = [buildMonitor({ status: "up", retries: 3 })];

    await runMonitoringCycle();

    expect(mocks.recordMonitorResult).toHaveBeenCalled();
    expect(mocks.appendMonitorCheck).not.toHaveBeenCalled();
    expect(mocks.appendMonitorEvent).not.toHaveBeenCalled();
    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalled();
  });

});

describe("verification timeout escalation", () => {
  it("keeps normal checks at their configured timeout", () => {
    expect(calculateVerificationTimeout(5000, 0)).toBe(5000);
  });

  it("increases verification timeout and caps it", () => {
    expect(calculateVerificationTimeout(5000, 1)).toBe(7500);
    expect(calculateVerificationTimeout(5000, 2)).toBe(10000);
    expect(calculateVerificationTimeout(100000, 2)).toBe(120000);
  });
});

function buildMonitor(overrides: Partial<Monitor> = {}): Monitor {
  const now = new Date("2026-05-08T06:59:00.000Z");

  return {
    id: "monitor-1",
    userId: "user-1",
    name: "API",
    monitorType: "http",
    url: "https://api.example.com",
    companyId: null,
    company: null,
    status: "up",
    statusCode: 200,
    uptime: "100%",
    isActive: true,
    deletedAt: null,
    deletedWasActive: null,
    lastCheckedAt: now,
    nextCheckAt: now,
    leaseToken: "lease-1",
    leaseExpiresAt: null,
    lastSuccessAt: now,
    lastFailureAt: null,
    sslExpiresAt: null,
    lastErrorMessage: null,
    consecutiveFailures: 0,
    verificationMode: false,
    verificationFailureCount: 0,
    latencyMs: 100,
    notificationPref: "none",
    notificationLanguage: "default",
    notifEmail: null,
    telegramBotToken: null,
    telegramChatId: null,
    heartbeatToken: null,
    heartbeatLastReceivedAt: null,
    intervalValue: 5,
    intervalUnit: "dk",
    timeout: 5000,
    slowResponseThresholdMs: null,
    slowResponseAlertsEnabled: true,
    expectedStatusCodes: null,
    retries: 3,
    method: "GET",
    databaseSsl: true,
    databasePasswordEncrypted: null,
    keywordQuery: null,
    keywordInvert: false,
    jsonPath: null,
    jsonExpectedValue: null,
    jsonMatchMode: "equals",
    tags: [],
    renotifyCount: null,
    maxRedirects: 5,
    ipFamily: "auto",
    checkSslExpiry: false,
    ignoreSslErrors: false,
    cacheBuster: false,
    saveErrorPages: false,
    saveSuccessPages: false,
    responseMaxLength: 1024,
    telegramTemplate: null,
    emailSubject: null,
    emailBody: null,
    sendOutageScreenshot: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function getNotificationContext(kind: NotificationContext["kind"]) {
  const call = mocks.sendMonitorNotifications.mock.calls.find(
    ([context]) => (context as NotificationContext).kind === kind
  );

  if (!call) {
    throw new Error(`Expected ${kind} notification to be sent.`);
  }

  return call[0] as NotificationContext;
}
