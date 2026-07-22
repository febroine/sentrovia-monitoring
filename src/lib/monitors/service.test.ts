import { describe, expect, it } from "vitest";
import {
  buildRestoredMonitorState,
  calculateMonitorLeaseMs,
  filterDuplicateMonitorInputs,
  normalizeHeartbeatTokenInput,
  selectDueMonitorsForCycle,
  spreadInitialMonitorChecks,
  summarizeCompanyRecentChecks,
} from "@/lib/monitors/service";
import type { MonitorInput } from "@/lib/monitors/schemas";
import { buildMonitorIdentityKey } from "@/lib/monitors/targets";

describe("monitor due selection", () => {
  it("keeps leases longer than the slowest monitor timeout", () => {
    expect(calculateMonitorLeaseMs([{ timeout: 120_000 }])).toBe(240_000);
  });

  it("keeps verification leases long enough for the final confirmation probe", () => {
    expect(calculateMonitorLeaseMs([{ timeout: 60_000, verificationMode: true }])).toBe(360_000);
  });

  it("prioritizes verification checks before normal due monitors within the batch", () => {
    const selected = selectDueMonitorsForCycle(
      [
        buildDueMonitor("normal-old", false, "2026-05-08T06:55:00.000Z"),
        buildDueMonitor("normal-newer", false, "2026-05-08T06:56:00.000Z"),
        buildDueMonitor("verification", true, "2026-05-08T06:59:00.000Z"),
      ],
      new Map([["user-1", 2]])
    );

    expect(selected.map((monitor) => monitor.id)).toEqual(["verification", "normal-old"]);
  });

  it("keeps per-user batch limits independent", () => {
    const selected = selectDueMonitorsForCycle(
      [
        buildDueMonitor("user-1-verification", true, "2026-05-08T06:59:00.000Z", "user-1"),
        buildDueMonitor("user-1-normal", false, "2026-05-08T06:55:00.000Z", "user-1"),
        buildDueMonitor("user-2-normal", false, "2026-05-08T06:55:00.000Z", "user-2"),
      ],
      new Map([
        ["user-1", 1],
        ["user-2", 1],
      ])
    );

    expect(selected.map((monitor) => monitor.id)).toEqual(["user-1-verification", "user-2-normal"]);
  });
});

describe("monitor restore state", () => {
  it("does not revive stale outage and verification state after undo", () => {
    expect(buildRestoredMonitorState()).toEqual({
      status: "pending",
      statusCode: null,
      uptime: "--",
      lastCheckedAt: null,
      lastFailureAt: null,
      sslExpiresAt: null,
      lastErrorMessage: null,
      consecutiveFailures: 0,
      verificationMode: false,
      verificationFailureCount: 0,
      latencyMs: null,
      leaseToken: null,
      leaseExpiresAt: null,
    });
  });
});

describe("company recent check summary", () => {
  it("includes non-HTTP monitor latency while keeping status-code counts HTTP-only", () => {
    const summary = summarizeCompanyRecentChecks([
      { status: "up", statusCode: 200, latencyMs: 100 },
      { status: "up", statusCode: null, latencyMs: 300 },
      { status: "pending", statusCode: null, latencyMs: 900 },
    ]);

    expect(summary.averageLatencyMs).toBe(200);
    expect(summary.statusCodes).toEqual([{ statusCode: 200, count: 1 }]);
  });
});

describe("heartbeat token input", () => {
  it("rejects invalid public heartbeat tokens before database lookup", () => {
    expect(normalizeHeartbeatTokenInput("short")).toBeNull();
    expect(normalizeHeartbeatTokenInput("x".repeat(256))).toBeNull();
  });

  it("trims and accepts valid public heartbeat tokens", () => {
    const token = "a".repeat(24);

    expect(normalizeHeartbeatTokenInput(` ${token} `)).toBe(token);
  });
});

describe("monitor import duplicate filtering", () => {
  it("keeps heartbeat imports with blank tokens because tokens are generated later", () => {
    const filtered = filterDuplicateMonitorInputs(
      [
        buildMonitorInput({ name: "Job A", monitorType: "heartbeat", heartbeatToken: "" }),
        buildMonitorInput({ name: "Job B", monitorType: "heartbeat", heartbeatToken: "" }),
      ],
      new Set()
    );

    expect(filtered.map((monitor) => monitor.name)).toEqual(["Job A", "Job B"]);
  });

  it("removes duplicate heartbeat imports when a token is explicitly provided", () => {
    const token = "heartbeat-token-123456";
    const filtered = filterDuplicateMonitorInputs(
      [
        buildMonitorInput({ name: "Job A", monitorType: "heartbeat", heartbeatToken: token }),
        buildMonitorInput({ name: "Job B", monitorType: "heartbeat", heartbeatToken: token }),
      ],
      new Set()
    );

    expect(filtered.map((monitor) => monitor.name)).toEqual(["Job A"]);
  });

  it("removes imports that duplicate existing monitor targets", () => {
    const existingTargets = new Set([
      buildMonitorIdentityKey({ monitorType: "http", url: "https://example.com/health" }),
    ]);
    const filtered = filterDuplicateMonitorInputs(
      [
        buildMonitorInput({ name: "Existing", url: "https://example.com/health" }),
        buildMonitorInput({ name: "New", url: "https://example.com/status" }),
      ],
      existingTargets
    );

    expect(filtered.map((monitor) => monitor.name)).toEqual(["New"]);
  });
});

describe("monitor cold start spread", () => {
  it("spreads imported monitors across their first interval up to five minutes", () => {
    const scheduled = spreadInitialMonitorChecks(
      Array.from({ length: 5 }, (_, index) => ({
        name: `Monitor ${index + 1}`,
        intervalValue: 5,
        intervalUnit: "dk",
      })),
      new Date("2026-05-08T07:00:00.000Z")
    );

    expect(scheduled.map((monitor) => monitor.nextCheckAt.toISOString())).toEqual([
      "2026-05-08T07:00:00.000Z",
      "2026-05-08T07:01:00.000Z",
      "2026-05-08T07:02:00.000Z",
      "2026-05-08T07:03:00.000Z",
      "2026-05-08T07:04:00.000Z",
    ]);
  });

  it("uses the shortest interval as the spread window for faster monitors", () => {
    const scheduled = spreadInitialMonitorChecks(
      [
        { name: "Fast", intervalValue: 30, intervalUnit: "sn" },
        { name: "Normal", intervalValue: 5, intervalUnit: "dk" },
        { name: "Slow", intervalValue: 1, intervalUnit: "sa" },
      ],
      new Date("2026-05-08T07:00:00.000Z")
    );

    expect(scheduled.map((monitor) => monitor.nextCheckAt.toISOString())).toEqual([
      "2026-05-08T07:00:00.000Z",
      "2026-05-08T07:00:10.000Z",
      "2026-05-08T07:00:20.000Z",
    ]);
  });
});

function buildDueMonitor(
  id: string,
  verificationMode: boolean,
  nextCheckAt: string,
  userId = "user-1"
) {
  return {
    id,
    userId,
    verificationMode,
    nextCheckAt: new Date(nextCheckAt),
    createdAt: new Date("2026-05-08T06:00:00.000Z"),
  };
}

function buildMonitorInput(overrides: Partial<MonitorInput> = {}): MonitorInput {
  return {
    name: "Monitor",
    monitorType: "http",
    url: "https://example.com/health",
    portHost: "",
    portNumber: 443,
    heartbeatToken: "",
    heartbeatLastReceivedAt: null,
    databaseHost: "",
    databasePort: 5432,
    databaseName: "",
    databaseUsername: "",
    databasePassword: "",
    databasePasswordConfigured: false,
    databaseSsl: true,
    keywordQuery: "",
    keywordInvert: false,
    jsonPath: "",
    jsonExpectedValue: "",
    jsonMatchMode: "equals",
    companyId: null,
    company: null,
    notificationPref: "none",
    notificationLanguage: "default",
    notifEmail: null,
    telegramBotToken: null,
    telegramChatId: null,
    intervalValue: 5,
    intervalUnit: "dk",
    timeout: 5000,
    slowResponseThresholdMs: null,
    slowResponseAlertsEnabled: true,
    expectedStatusCodes: "",
    retries: 3,
    method: "GET",
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
    isActive: true,
    ...overrides,
  };
}
