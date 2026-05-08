import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { Monitor } from "@/lib/db/schema";
import { checkHttpMonitor } from "@/worker/check-http";

const servers: http.Server[] = [];

describe("http monitor checks", () => {
  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          })
      )
    );
    servers.length = 0;
  });

  it("marks an unfollowed redirect as down when redirect limit is reached", async () => {
    const server = await createServer((_, response) => {
      response.writeHead(302, { Location: "/healthy" });
      response.end();
    });

    const result = await checkHttpMonitor(
      buildHttpMonitor({
        url: `http://127.0.0.1:${resolveServerPort(server)}/redirect`,
        maxRedirects: 0,
      })
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe("down");
    expect(result.statusCode).toBe(302);
    expect(result.errorMessage).toContain("redirect response");
  });

  it("follows redirects until a healthy final response", async () => {
    const server = await createServer((request, response) => {
      if (request.url === "/redirect") {
        response.writeHead(302, { Location: "/healthy" });
        response.end();
        return;
      }

      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("ok");
    });

    const result = await checkHttpMonitor(
      buildHttpMonitor({
        url: `http://127.0.0.1:${resolveServerPort(server)}/redirect`,
        maxRedirects: 1,
      })
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe("up");
    expect(result.statusCode).toBe(200);
  });
});

function createServer(handler: http.RequestListener) {
  const server = http.createServer(handler);
  servers.push(server);

  return new Promise<http.Server>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function resolveServerPort(server: http.Server) {
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Test server did not expose a TCP port.");
  }

  return address.port;
}

function buildHttpMonitor(overrides: Partial<Monitor> = {}): Monitor {
  const now = new Date("2026-05-08T07:00:00.000Z");

  return {
    id: "monitor-1",
    userId: "user-1",
    name: "HTTP",
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
    leaseToken: null,
    leaseExpiresAt: null,
    lastSuccessAt: now,
    lastFailureAt: null,
    sslExpiresAt: null,
    lastErrorMessage: null,
    consecutiveFailures: 0,
    verificationMode: false,
    verificationFailureCount: 0,
    latencyMs: 10,
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
    ipFamily: "ipv4",
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
