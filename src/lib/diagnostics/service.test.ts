import http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Monitor } from "@/lib/db/schema";
import { runMonitorDiagnostics } from "@/lib/diagnostics/service";

const mocks = vi.hoisted(() => ({
  assertMonitorNetworkTarget: vi.fn(),
}));

vi.mock("@/lib/security/public-network-target", () => ({
  assertMonitorNetworkTarget: mocks.assertMonitorNetworkTarget,
}));

let activeServer: http.Server | null = null;

beforeEach(() => {
  mocks.assertMonitorNetworkTarget.mockReset().mockResolvedValue(undefined);
});

afterEach(async () => {
  if (!activeServer) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    activeServer?.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
  activeServer = null;
});

describe("runMonitorDiagnostics", () => {
  it("uses the monitor HTTP method for the diagnostic probe", async () => {
    const { server, url } = await startMethodAwareServer();
    activeServer = server;

    const diagnostic = await runMonitorDiagnostics(buildMonitor({ url, method: "POST" }));

    expect(diagnostic.httpStatus).toBe("ok");
    expect(diagnostic.httpStatusCode).toBe(200);
  });

  it("treats an unfollowed redirect as a failed HTTP diagnostic", async () => {
    const { server, url } = await startRedirectServer();
    activeServer = server;

    const diagnostic = await runMonitorDiagnostics(buildMonitor({ url, maxRedirects: 0 }));

    expect(diagnostic.httpStatus).toBe("failed");
    expect(diagnostic.httpStatusCode).toBe(302);
    expect(diagnostic.failureCategory).toBe("redirect_error");
  });

  it("follows redirects within the monitor redirect limit", async () => {
    const { server, url } = await startRedirectServer();
    activeServer = server;

    const diagnostic = await runMonitorDiagnostics(buildMonitor({ url, maxRedirects: 1 }));

    expect(diagnostic.httpStatus).toBe("ok");
    expect(diagnostic.httpStatusCode).toBe(200);
  });

  it("treats a custom expected HTTP status as healthy", async () => {
    const { server, url } = await startStatusServer(401);
    activeServer = server;

    const diagnostic = await runMonitorDiagnostics(buildMonitor({ url, expectedStatusCodes: "401" }));

    expect(diagnostic.httpStatus).toBe("ok");
    expect(diagnostic.httpStatusCode).toBe(401);
    expect(diagnostic.failureCategory).toBeNull();
  });

  it("checks the network safety policy again for redirect targets", async () => {
    const { server, url } = await startRedirectServer();
    activeServer = server;
    mocks.assertMonitorNetworkTarget
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("redirect target blocked"));

    const diagnostic = await runMonitorDiagnostics(buildMonitor({ url, maxRedirects: 1 }));

    expect(mocks.assertMonitorNetworkTarget).toHaveBeenCalledTimes(3);
    expect(diagnostic.httpStatus).toBe("failed");
    expect(diagnostic.errorMessage).toBe("redirect target blocked");
  });
});

function startStatusServer(statusCode: number) {
  const server = http.createServer((_request, response) => {
    response.statusCode = statusCode;
    response.end("status");
  });

  return listen(server, "/health");
}

function startMethodAwareServer() {
  const server = http.createServer((request, response) => {
    response.statusCode = request.method === "POST" ? 200 : 405;
    response.end("ok");
  });

  return new Promise<{ server: http.Server; url: string }>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Test server did not expose a TCP port."));
        return;
      }

      resolve({ server, url: `http://127.0.0.1:${address.port}/health` });
    });
  });
}

function startRedirectServer() {
  const server = http.createServer((request, response) => {
    if (request.url === "/redirect") {
      response.statusCode = 302;
      response.setHeader("Location", "/ok");
      response.end();
      return;
    }

    response.statusCode = 200;
    response.end("ok");
  });

  return listen(server, "/redirect");
}

function listen(server: http.Server, path: string) {
  return new Promise<{ server: http.Server; url: string }>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Test server did not expose a TCP port."));
        return;
      }

      resolve({ server, url: `http://127.0.0.1:${address.port}${path}` });
    });
  });
}

function buildMonitor(overrides: Partial<Monitor> = {}): Monitor {
  const now = new Date("2026-05-08T06:59:00.000Z");

  return {
    id: "monitor-1",
    userId: "user-1",
    name: "API",
    monitorType: "http",
    url: "http://127.0.0.1",
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
