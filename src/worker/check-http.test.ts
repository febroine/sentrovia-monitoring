import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monitor } from "@/lib/db/schema";
import { checkHttpMonitor } from "@/worker/check-http";

vi.mock("@/lib/security/public-network-target", () => ({
  assertMonitorNetworkTarget: vi.fn(),
}));

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

  it("allows configured non-2xx status codes as healthy responses", async () => {
    const server = await createServer((_, response) => {
      response.writeHead(401, { "Content-Type": "text/plain" });
      response.end("auth required");
    });

    const result = await checkHttpMonitor(
      buildHttpMonitor({
        url: `http://127.0.0.1:${resolveServerPort(server)}/private`,
        expectedStatusCodes: "200, 401",
      })
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe("up");
    expect(result.statusCode).toBe(401);
    expect(result.failureReason).toBeUndefined();
  });

  it("does not follow redirects when the redirect status is explicitly expected", async () => {
    const server = await createServer((_, response) => {
      response.writeHead(302, { Location: "/healthy" });
      response.end();
    });

    const result = await checkHttpMonitor(
      buildHttpMonitor({
        url: `http://127.0.0.1:${resolveServerPort(server)}/redirect`,
        expectedStatusCodes: "302",
        maxRedirects: 5,
      })
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe("up");
    expect(result.statusCode).toBe(302);
  });

  it("treats non-redirect 3xx responses as healthy by default", async () => {
    const server = await createServer((_, response) => {
      response.writeHead(304);
      response.end();
    });

    const result = await checkHttpMonitor(
      buildHttpMonitor({ url: `http://127.0.0.1:${resolveServerPort(server)}/cached` })
    );

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(304);
  });

  it("switches POST requests to GET when following a 303 redirect", async () => {
    const methods: string[] = [];
    const server = await createServer((request, response) => {
      methods.push(request.method ?? "");
      if (request.url === "/submit") {
        response.writeHead(303, { Location: "/result" });
        response.end();
        return;
      }

      response.writeHead(200);
      response.end("ok");
    });

    const result = await checkHttpMonitor(
      buildHttpMonitor({
        url: `http://127.0.0.1:${resolveServerPort(server)}/submit`,
        method: "POST",
      })
    );

    expect(result.ok).toBe(true);
    expect(methods).toEqual(["POST", "GET"]);
  });

  it("classifies unexpected HTTP status codes separately from network failures", async () => {
    const server = await createServer((_, response) => {
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end("failed");
    });

    const result = await checkHttpMonitor(
      buildHttpMonitor({
        url: `http://127.0.0.1:${resolveServerPort(server)}/failed`,
      })
    );

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.failureReason).toBe("http_status");
    expect(result.errorMessage).toBe("Service returned HTTP 500.");
  });

  it("classifies request timeout failures with a timeout-specific message", async () => {
    const server = await createServer((_, response) => {
      setTimeout(() => {
        response.writeHead(200, { "Content-Type": "text/plain" });
        response.end("late");
      }, 80);
    });

    const result = await checkHttpMonitor(
      buildHttpMonitor({
        url: `http://127.0.0.1:${resolveServerPort(server)}/slow`,
        timeout: 20,
      })
    );

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.failureReason).toBe("timeout");
    expect(result.errorMessage).toBe("Service did not respond within 20ms.");
  });

  it("enforces the hard timeout across the complete response body", async () => {
    const server = await createServer((_, response) => {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.write("start");
      const interval = setInterval(() => response.write("."), 5);
      const finish = setTimeout(() => response.end("done"), 80);
      response.on("close", () => {
        clearInterval(interval);
        clearTimeout(finish);
      });
    });

    const result = await checkHttpMonitor(
      buildHttpMonitor({
        url: `http://127.0.0.1:${resolveServerPort(server)}/streaming`,
        timeout: 25,
      })
    );

    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe("timeout");
    expect(result.errorMessage).toBe("Service did not respond within 25ms.");
  });

  it("applies a bounded safety limit when response length is configured as unlimited", async () => {
    const server = await createServer((_, response) => {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end(`${"a".repeat(100_000)}needle-after-limit`);
    });

    const result = await checkHttpMonitor(
      buildHttpMonitor({
        monitorType: "keyword",
        url: `http://127.0.0.1:${resolveServerPort(server)}/large-body`,
        keywordQuery: "needle-after-limit",
        responseMaxLength: 0,
      })
    );

    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe("assertion");
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
    deletedAt: null,
    deletedWasActive: null,
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
    sendOutageScreenshot: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
