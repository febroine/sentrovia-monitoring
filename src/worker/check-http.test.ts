import http from "node:http";
import https from "node:https";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monitor } from "@/lib/db/schema";
import { createPinnedLookup } from "@/lib/security/public-network-target";
import { checkHttpMonitor } from "@/worker/check-http";

vi.mock("@/lib/security/public-network-target", () => ({
  resolveMonitorNetworkTargetWithTimeout: vi.fn(async (hostname: string) => ({
    hostname,
    addresses: [{ address: hostname, family: 4 }],
  })),
  createPinnedLookup: vi.fn(() => undefined),
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

  it("identifies as a desktop browser so bot filters treat the check like a visitor", async () => {
    let headers: http.IncomingHttpHeaders = {};
    const server = await createServer((request, response) => {
      headers = request.headers;
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("ok");
    });

    const result = await checkHttpMonitor(
      buildHttpMonitor({ url: `http://127.0.0.1:${resolveServerPort(server)}/` })
    );

    expect(result.ok).toBe(true);
    expect(headers["user-agent"]).toMatch(/^Mozilla\/5\.0 .* Chrome\/[\d.]+ Safari\/537\.36 Sentrovia-Monitor$/);
    expect(headers.accept).toBe("*/*");
    expect(headers["accept-language"]).toBeUndefined();
    expect(headers["accept-encoding"]).toBeUndefined();
  });

  it("keeps JSON monitors working against APIs that negotiate HTML for browsers", async () => {
    const server = await createServer((request, response) => {
      if (request.headers.accept?.startsWith("text/html")) {
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end("<html>browsable API</html>");
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
    });

    const result = await checkHttpMonitor(
      buildHttpMonitor({
        monitorType: "json",
        url: `http://127.0.0.1:${resolveServerPort(server)}/health`,
        jsonPath: "status",
        jsonExpectedValue: "ok",
      })
    );

    expect(result.errorMessage).toBeNull();
    expect(result.ok).toBe(true);
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

  it("reports the final HTTP error after following a redirect", async () => {
    const server = await createServer((request, response) => {
      if (request.url === "/redirect") {
        response.writeHead(302, { Location: "/unavailable" });
        response.end();
        return;
      }

      response.writeHead(503, { "Content-Type": "text/html" });
      response.end("<h1>503 Service Unavailable</h1>");
    });

    const result = await checkHttpMonitor(buildHttpMonitor({
      url: `http://127.0.0.1:${resolveServerPort(server)}/redirect`,
      maxRedirects: 1,
    }));

    expect(result.status).toBe("down");
    expect(result.statusCode).toBe(503);
    expect(result.errorMessage).toBe("Service returned HTTP 503.");
  });

  it("treats a malformed redirect location as a failed check", async () => {
    const server = await createServer((_, response) => {
      response.writeHead(302, { Location: "http://[::1" });
      response.end();
    });

    const result = await checkHttpMonitor(
      buildHttpMonitor({
        url: `http://127.0.0.1:${resolveServerPort(server)}/redirect`,
        maxRedirects: 1,
      })
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe("down");
    expect(result.errorMessage).toContain("invalid redirect location");
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

  it("decompresses gzip responses before evaluating keyword assertions", async () => {
    const server = await createServer((_, response) => {
      response.writeHead(200, { "Content-Encoding": "gzip" });
      response.end(gzipSync("healthy response"));
    });

    const result = await checkHttpMonitor(
      buildHttpMonitor({
        monitorType: "keyword",
        url: `http://127.0.0.1:${resolveServerPort(server)}/gzip`,
        keywordQuery: "healthy response",
      })
    );

    expect(result.ok).toBe(true);
  });

  it("decompresses Brotli responses before evaluating JSON assertions", async () => {
    const server = await createServer((_, response) => {
      response.writeHead(200, { "Content-Encoding": "br" });
      response.end(brotliCompressSync(JSON.stringify({ status: "healthy" })));
    });

    const result = await checkHttpMonitor(
      buildHttpMonitor({
        monitorType: "json",
        url: `http://127.0.0.1:${resolveServerPort(server)}/brotli`,
        jsonPath: "status",
        jsonExpectedValue: "healthy",
      })
    );

    expect(result.ok).toBe(true);
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
    expect(result.errorMessage).toBe("Service did not complete within the 20ms hard timeout.");
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
    expect(result.errorMessage).toBe("Service did not complete within the 25ms hard timeout.");
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

describe("failure evidence", () => {
  afterEach(async () => {
    await Promise.all(servers.map((server) => new Promise<void>((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    })));
    servers.length = 0;
  });

  it("records who answered, how long each step took and a readable, secret-free body", async () => {
    const server = await createServer((_, response) => {
      response.writeHead(502, {
        "Content-Type": "text/html; charset=utf-8",
        Server: "nginx/1.25",
        "CF-Ray": "8a1b2c3d4e5f-IST",
        "Set-Cookie": "session=very-secret",
      });
      response.end(`<html><head><title>Bad gateway</title><style>body{}</style></head><body>
        <script>var apiKey = "should-not-appear";</script>
        <h1>502 Bad Gateway</h1><p>Upstream &amp; origin failed. token=abc123secret</p></body></html>`);
    });
    const port = resolveServerPort(server);

    const result = await checkHttpMonitor(buildHttpMonitor({ url: `http://127.0.0.1:${port}/status?token=hidden&page=1` }));

    expect(result.ok).toBe(false);
    const evidence = result.evidence;
    expect(evidence?.phase).toBe("response");
    expect(evidence?.hops).toHaveLength(1);
    const [hop] = evidence!.hops;
    expect(hop.url).toBe(`http://127.0.0.1:${port}/status?token=%5Bredacted%5D&page=1`);
    expect(hop.statusCode).toBe(502);
    expect(hop.remoteAddress).toBe("127.0.0.1");
    expect(hop.remotePort).toBe(port);
    expect(hop.headers).toEqual({
      server: "nginx/1.25",
      "cf-ray": "8a1b2c3d4e5f-IST",
      "content-type": "text/html; charset=utf-8",
    });
    expect(hop.timings.connectMs).toEqual(expect.any(Number));
    expect(hop.timings.firstByteMs).toEqual(expect.any(Number));
    expect(hop.timings.totalMs).toEqual(expect.any(Number));
    expect(hop.timings.tlsMs).toBeNull();
    expect(evidence?.body?.excerpt).toContain("502 Bad Gateway");
    expect(evidence?.body?.excerpt).toContain("Upstream & origin failed.");
    expect(evidence?.body?.excerpt).not.toMatch(/should-not-appear|abc123secret|body\{\}/);
    expect(evidence?.error).toBe("Service returned HTTP 502.");
    expect(JSON.stringify(evidence)).not.toContain("very-secret");
  });

  it("records nothing for a passing check", async () => {
    const server = await createServer((_, response) => {
      response.writeHead(200);
      response.end("ok");
    });

    const result = await checkHttpMonitor(buildHttpMonitor({ url: `http://127.0.0.1:${resolveServerPort(server)}/` }));

    expect(result.ok).toBe(true);
    expect(result.evidence).toBeNull();
  });

  it("shows that a timed-out server accepted the connection but never answered", async () => {
    const server = await createServer(() => undefined);
    const port = resolveServerPort(server);

    const result = await checkHttpMonitor(buildHttpMonitor({ url: `http://127.0.0.1:${port}/`, timeout: 300 }));

    expect(result.failureReason).toBe("timeout");
    expect(result.evidence?.phase).toBe("first-byte");
    expect(result.evidence?.hops[0]).toMatchObject({
      remoteAddress: "127.0.0.1",
      remotePort: port,
      statusCode: null,
      timings: expect.objectContaining({ connectMs: expect.any(Number), firstByteMs: null }),
    });
    expect(result.evidence?.body).toBeNull();
  });

  it("shows that a server sent its headers and then stalled the body", async () => {
    const server = await createServer((_, response) => {
      response.writeHead(200, { "Content-Type": "text/html", Server: "slow-origin" });
      response.write("<p>partial");
    });

    const result = await checkHttpMonitor(buildHttpMonitor({ url: `http://127.0.0.1:${resolveServerPort(server)}/`, timeout: 300 }));

    expect(result.evidence?.phase).toBe("body");
    expect(result.evidence?.hops[0]).toMatchObject({ statusCode: 200, headers: expect.objectContaining({ server: "slow-origin" }) });
  });

  it("names the address and port that refused the connection", async () => {
    const server = await createServer(() => undefined);
    const port = resolveServerPort(server);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    servers.length = 0;

    const result = await checkHttpMonitor(buildHttpMonitor({ url: `http://127.0.0.1:${port}/` }));

    expect(result.evidence?.phase).toBe("connect");
    expect(result.evidence?.hops[0]).toMatchObject({ remotePort: port, statusCode: null });
    expect(result.evidence?.error).toMatch(/ECONNREFUSED/);
  });

  it("names the address a host name resolved to when the connection is refused", async () => {
    const server = await createServer(() => undefined);
    const port = resolveServerPort(server);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    servers.length = 0;
    vi.mocked(createPinnedLookup).mockImplementationOnce(() => ((_hostname, options, callback) => {
      queueMicrotask(() => (options.all
        ? (callback as (error: null, addresses: Array<{ address: string; family: number }>) => void)(null, [{ address: "127.0.0.1", family: 4 }])
        : (callback as (error: null, address: string, family: number) => void)(null, "127.0.0.1", 4)));
    }) as ReturnType<typeof createPinnedLookup>);

    const result = await checkHttpMonitor(buildHttpMonitor({ url: `http://refused.sentrovia.test:${port}/` }));

    expect(result.evidence?.phase).toBe("connect");
    expect(result.evidence?.hops[0]).toMatchObject({ remoteAddress: "127.0.0.1", remotePort: port });
  });

  it("reports an unusable redirect target as a rejected response", async () => {
    const server = await createServer((_, response) => {
      response.writeHead(302, { Location: "http://[invalid" });
      response.end();
    });

    const result = await checkHttpMonitor(buildHttpMonitor({ url: `http://127.0.0.1:${resolveServerPort(server)}/`, maxRedirects: 2 }));

    expect(result.errorMessage).toBe("Service returned an invalid redirect location.");
    expect(result.evidence?.phase).toBe("response");
  });

  it("records the redirect chain without the secrets in it", async () => {
    const server = await createServer((request, response) => {
      if (request.url === "/start") {
        response.writeHead(302, { Location: "/login?session=abc&next=%2F" });
        response.end();
        return;
      }
      response.writeHead(503, { "Content-Type": "application/json", "Retry-After": "120" });
      response.end(JSON.stringify({ error_code: "MAINTENANCE", access_token: "leak", message: "Back soon" }));
    });
    const port = resolveServerPort(server);

    const result = await checkHttpMonitor(buildHttpMonitor({ url: `http://127.0.0.1:${port}/start`, maxRedirects: 3 }));

    const hops = result.evidence?.hops ?? [];
    expect(hops.map((hop) => hop.statusCode)).toEqual([302, 503]);
    expect(hops[0].headers.location).toBe("/login?session=%5Bredacted%5D&next=%2F");
    expect(hops[1].url).toBe(`http://127.0.0.1:${port}/login?session=%5Bredacted%5D&next=%2F`);
    expect(hops[1].headers["retry-after"]).toBe("120");
    expect(result.evidence?.body?.excerpt).toContain("MAINTENANCE");
    expect(result.evidence?.body?.excerpt).toContain("Back soon");
    expect(result.evidence?.body?.excerpt).not.toContain("leak");
  });

  it("shows the certificate the check rejected", async () => {
    const server = https.createServer({ key: TEST_TLS_KEY, cert: TEST_TLS_CERTIFICATE }, (_, response) => {
      response.writeHead(200);
      response.end("ok");
    });
    servers.push(server as unknown as http.Server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;

    const result = await checkHttpMonitor(buildHttpMonitor({ url: `https://127.0.0.1:${port}/` }));

    expect(result.failureReason).toBe("tls");
    expect(result.evidence?.phase).toBe("tls");
    expect(result.evidence?.certificate).toMatchObject({
      subject: "self-signed.sentrovia.test",
      issuer: "self-signed.sentrovia.test",
      validTo: expect.any(String),
    });
    expect(result.evidence?.hops[0]).toMatchObject({ remoteAddress: "127.0.0.1", remotePort: port, statusCode: null });
  });

  it("opens a new connection for every check", async () => {
    let connections = 0;
    const server = await createServer((_, response) => {
      response.writeHead(500);
      response.end("down");
    });
    server.keepAliveTimeout = 60_000;
    server.on("connection", () => {
      connections += 1;
    });
    const monitor = buildHttpMonitor({ url: `http://127.0.0.1:${resolveServerPort(server)}/` });

    await checkHttpMonitor(monitor);
    const second = await checkHttpMonitor(monitor);

    expect(connections).toBe(2);
    expect(second.evidence?.hops[0].reusedConnection).toBe(false);
    expect(second.evidence?.hops[0].timings.connectMs).toEqual(expect.any(Number));
  });

  it("keeps the body that a keyword assertion failed on", async () => {
    const server = await createServer((_, response) => {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("Service temporarily unavailable");
    });

    const result = await checkHttpMonitor(buildHttpMonitor({
      monitorType: "keyword",
      keywordQuery: "Welcome",
      url: `http://127.0.0.1:${resolveServerPort(server)}/`,
    }));

    expect(result.failureReason).toBe("assertion");
    expect(result.evidence?.phase).toBe("response");
    expect(result.evidence?.body?.excerpt).toBe("Service temporarily unavailable");
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
    workspaceId: "workspace-1",
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
    pausedUntil: null,
    publishOnStatusPage: false,
    isFavorite: false,
    isCritical: false,
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
    heartbeatTokenHash: null,
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
    databaseTlsVerify: true,
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
    emailHeadline: null,
    emailBody: null,
    slowResponseEmailSubject: null,
    slowResponseEmailHeadline: null,
    slowResponseEmailBody: null,
    slowResponseTelegramTemplate: null,
    recoveryEmailSubject: null,
    recoveryEmailHeadline: null,
    recoveryEmailBody: null,
    recoveryTelegramTemplate: null,
    prolongedDowntimeEmailSubject: null,
    prolongedDowntimeEmailHeadline: null,
    prolongedDowntimeEmailBody: null,
    prolongedDowntimeTelegramTemplate: null,
    sslExpiryEmailSubject: null,
    sslExpiryEmailHeadline: null,
    sslExpiryEmailBody: null,
    sslExpiryTelegramTemplate: null,
    sendOutageScreenshot: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// Self-signed certificate for a TLS failure; valid until 2126 so the test never expires.
const TEST_TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg5UrdHcTwJrh6pd1r
1KbDO3LvfCAqi25Ijrh+FsjEYl+hRANCAARmAJOO7iybdQbQH2BjiYr/coQBz8vF
BlZxA4KZB2FZxjjvQ97AiI+vlV1ghsFsv9fjxk3ZMSD3dH+D7jQdfDFt
-----END PRIVATE KEY-----`;
const TEST_TLS_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIB1DCCAXmgAwIBAgIUEU2zGsJ+t6FFbaXjGkBn4YiprfwwCgYIKoZIzj0EAwIw
PjEjMCEGA1UEAwwac2VsZi1zaWduZWQuc2VudHJvdmlhLnRlc3QxFzAVBgNVBAoM
DlNlbnRyb3ZpYSBUZXN0MCAXDTI2MTAwMjExNTkzOFoYDzIxMjYwOTA4MTE1OTM4
WjA+MSMwIQYDVQQDDBpzZWxmLXNpZ25lZC5zZW50cm92aWEudGVzdDEXMBUGA1UE
CgwOU2VudHJvdmlhIFRlc3QwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAARmAJOO
7iybdQbQH2BjiYr/coQBz8vFBlZxA4KZB2FZxjjvQ97AiI+vlV1ghsFsv9fjxk3Z
MSD3dH+D7jQdfDFto1MwUTAdBgNVHQ4EFgQUE/bkB/x9un07WKq0YPl7823qISow
HwYDVR0jBBgwFoAUE/bkB/x9un07WKq0YPl7823qISowDwYDVR0TAQH/BAUwAwEB
/zAKBggqhkjOPQQDAgNJADBGAiEAj/QEfvt7BtIqu3UkQMzu+pQ8Xy/7I8ytaohU
fxzxTPsCIQCWltew7vZU7K246Igh+QzQsqJlKMez2DqH5q2twvbKiA==
-----END CERTIFICATE-----`;
