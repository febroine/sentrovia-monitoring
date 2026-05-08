import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Monitor } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  dueMonitors: [] as Monitor[],
  checkResult: {
    ok: false,
    status: "down" as const,
    statusCode: 500,
    latencyMs: 120,
    errorMessage: "HTTP 500",
    checkedAt: new Date("2026-05-08T07:00:00.000Z"),
    sslExpiresAt: null,
  },
  appendMonitorCheck: vi.fn(),
  appendMonitorEvent: vi.fn(),
  claimDueMonitors: vi.fn(),
  countDueMonitors: vi.fn(),
  incrementWorkerCheckedCount: vi.fn(),
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
  checkMonitor: vi.fn(() => Promise.resolve(mocks.checkResult)),
}));

vi.mock("@/worker/notifier", () => ({
  sendMonitorNotifications: mocks.sendMonitorNotifications,
}));

import { runMonitoringCycle } from "@/worker/scheduler";

describe("monitoring scheduler verification flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dueMonitors = [];
    mocks.claimDueMonitors.mockImplementation(() => Promise.resolve(mocks.dueMonitors));
    mocks.countDueMonitors.mockImplementation(() => Promise.resolve(mocks.dueMonitors.length));
    mocks.incrementWorkerCheckedCount.mockResolvedValue(null);
    mocks.recordMonitorResult.mockResolvedValue(null);
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
      })
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
      })
    );
    expect(mocks.sendMonitorNotifications).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "failure" })
    );
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
    leaseToken: null,
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
