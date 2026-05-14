import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { Monitor } from "@/lib/db/schema";
import { runMonitorDiagnostics } from "@/lib/diagnostics/service";

let activeServer: http.Server | null = null;

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
});

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

  return new Promise<{ server: http.Server; url: string }>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Test server did not expose a TCP port."));
        return;
      }

      resolve({ server, url: `http://127.0.0.1:${address.port}/redirect` });
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
