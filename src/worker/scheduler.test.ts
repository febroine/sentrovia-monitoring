import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Monitor } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  dueMonitors: [] as Monitor[],
  checkResult: {
    ok: false,
    status: "down" as "up" | "down",
    statusCode: 500,
    latencyMs: 120,
    errorMessage: "HTTP 500" as string | null,
    checkedAt: new Date("2026-05-08T07:00:00.000Z"),
    sslExpiresAt: null,
  },
  checkResults: [] as Array<{
    ok: boolean;
    status: "up" | "down";
    statusCode: number | null;
    latencyMs: number | null;
    errorMessage: string | null;
    checkedAt: Date;
    sslExpiresAt: Date | null;
  }>,
  checkMonitor: vi.fn(),
  appendMonitorCheck: vi.fn(),
  appendMonitorEvent: vi.fn(),
  claimDueMonitors: vi.fn(),
  countDueMonitors: vi.fn(),
  incrementWorkerCheckedCount: vi.fn(),
  isMonitorActive: vi.fn(),
  openOrUpdateIncident: vi.fn(),
  recordMonitorResult: vi.fn(),
  recordWorkerCycleMetric: vi.fn(),
  resolveIncident: vi.fn(),
  sendMonitorNotifications: vi.fn(),
  updateWorkerState: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    workerConcurrency: 20,
    workerPollIntervalMs: 10_000,
  },
}));

vi.mock("@/lib/incidents/service", () => ({
  openOrUpdateIncident: mocks.openOrUpdateIncident,
  resolveIncident: mocks.resolveIncident,
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
  appendMonitorCheck: mocks.appendMonitorCheck,
  appendMonitorEvent: mocks.appendMonitorEvent,
  claimDueMonitors: mocks.claimDueMonitors,
  countDueMonitors: mocks.countDueMonitors,
  incrementWorkerCheckedCount: mocks.incrementWorkerCheckedCount,
  isMonitorActive: mocks.isMonitorActive,
  recordMonitorResult: mocks.recordMonitorResult,
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

import { calculateVerificationTimeout, runMonitoringCycle } from "@/worker/scheduler";

describe("monitoring scheduler verification flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkResult = {
      ok: false,
      status: "down",
      statusCode: 500,
      latencyMs: 120,
      errorMessage: "HTTP 500",
      checkedAt: new Date("2026-05-08T07:00:00.000Z"),
      sslExpiresAt: null,
    };
    mocks.checkResults = [];
    mocks.dueMonitors = [];
    mocks.claimDueMonitors.mockImplementation(() => Promise.resolve(mocks.dueMonitors));
    mocks.checkMonitor.mockImplementation(() => Promise.resolve(mocks.checkResults.shift() ?? mocks.checkResult));
    mocks.countDueMonitors.mockImplementation(() => Promise.resolve(mocks.dueMonitors.length));
    mocks.incrementWorkerCheckedCount.mockResolvedValue(null);
    mocks.isMonitorActive.mockResolvedValue(true);
    mocks.recordMonitorResult.mockResolvedValue({ id: "monitor-1" } as Monitor);
    mocks.recordWorkerCycleMetric.mockResolvedValue(null);
    mocks.updateWorkerState.mockResolvedValue(null);
    mocks.sendMonitorNotifications.mockResolvedValue(false);
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

  it("does not re-confirm an already down monitor when retries is one", async () => {
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
    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "failure" })
    );
  });

  it("sends recovery without a duplicate status-change notification", async () => {
    mocks.checkResult = {
      ok: true,
      status: "up",
      statusCode: 200,
      latencyMs: 95,
      errorMessage: null,
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
  });

  it("does not send a down alert when final verification already recovered", async () => {
    mocks.checkResults = [
      {
        ok: false,
        status: "down",
        statusCode: 500,
        latencyMs: 120,
        errorMessage: "HTTP 500",
        checkedAt: new Date("2026-05-08T07:00:00.000Z"),
        sslExpiresAt: null,
      },
      {
        ok: true,
        status: "up",
        statusCode: 200,
        latencyMs: 80,
        errorMessage: null,
        checkedAt: new Date("2026-05-08T07:00:01.000Z"),
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
        nextCheckAt: new Date("2026-05-08T07:05:01.000Z"),
        verificationMode: false,
        verificationFailureCount: 0,
        consecutiveFailures: 0,
      }),
      "lease-1"
    );
    expect(mocks.incrementWorkerCheckedCount).toHaveBeenCalledWith(2);
    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "failure" })
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

  it("uses a capped longer timeout for final outage confirmation", async () => {
    mocks.dueMonitors = [
      buildMonitor({
        status: "pending",
        timeout: 5000,
        retries: 2,
        verificationMode: true,
        verificationFailureCount: 1,
        consecutiveFailures: 1,
      }),
    ];

    await runMonitoringCycle();

    expect(mocks.checkMonitor).toHaveBeenNthCalledWith(1, expect.objectContaining({ timeout: 7500 }));
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
    notifEmail: null,
    telegramBotToken: null,
    telegramChatId: null,
    heartbeatToken: null,
    heartbeatLastReceivedAt: null,
    intervalValue: 5,
    intervalUnit: "dk",
    timeout: 5000,
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
    sendIncidentScreenshot: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
