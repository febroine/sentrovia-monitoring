import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monitor } from "@/lib/db/schema";
import { resolveMonitorNetworkTargetWithTimeout } from "@/lib/security/public-network-target";

vi.mock("@/lib/security/public-network-target", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/security/public-network-target")>();
  return {
    ...original,
    resolveMonitorNetworkTargetWithTimeout: vi.fn(async (hostname: string) => ({
      hostname,
      addresses: [{ address: "127.0.0.1", family: 4 as const }],
    })),
  };
});

import { buildFailureScreenshotAttachment } from "@/worker/screenshot";

const servers: http.Server[] = [];

describe("failure screenshot browser isolation", () => {
  afterEach(async () => {
    await Promise.all(servers.map(closeServer));
    servers.length = 0;
  });

  it.each([
    ["IP literal", (port: number) => `http://127.0.0.1:${port}/admin`],
    ["hostname", (port: number) => `http://localhost:${port}/admin`],
  ])("does not follow a public target redirect to a server-local %s", async (_targetType, buildLocation) => {
    let privateRequests = 0;
    const privateServer = await createServer((_, response) => {
      privateRequests += 1;
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<h1>Private administration</h1>");
    });
    const publicServer = await createServer((_, response) => {
      response.writeHead(302, {
        Location: buildLocation(resolveServerPort(privateServer)),
      });
      response.end();
    });

    const attachment = await buildFailureScreenshotAttachment(buildMonitor({
      url: `http://fixture.test:${resolveServerPort(publicServer)}/redirect`,
    }));

    expect(privateRequests).toBe(0);
    expect(attachment).toBeNull();
  }, 25_000);

  it("still captures an approved page", async () => {
    const publicServer = await createServer((_, response) => {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<h1>Public status</h1>");
    });

    const attachment = await buildFailureScreenshotAttachment(buildMonitor({
      url: `http://fixture.test:${resolveServerPort(publicServer)}/status`,
    }));

    expect(attachment?.content).toBeInstanceOf(Buffer);
  }, 25_000);

  it("captures the real page when the server responds with HTTP 503", async () => {
    const server = await createServer((_, response) => {
      response.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<h1>503 Service Unavailable</h1><p>Local screenshot test fixture</p>");
    });

    const attachment = await buildFailureScreenshotAttachment(buildMonitor({
      url: `http://fixture.test:${resolveServerPort(server)}/unavailable`,
    }));

    expect(attachment?.content).toBeInstanceOf(Buffer);
  }, 25_000);

  it("captures the actual error page after a validated cross-host redirect", async () => {
    let redirectedRequests = 0;
    let assetRequests = 0;
    const destinationServer = await createServer((request, response) => {
      if (request.url === "/error.css") {
        assetRequests += 1;
        response.writeHead(200, { "Content-Type": "text/css" });
        response.end("h1 { color: #9f1239; }");
        return;
      }
      redirectedRequests += 1;
      response.writeHead(503, { "Content-Type": "text/html" });
      response.end("<link rel=stylesheet href=/error.css><h1>503 Service Unavailable</h1><pre>SQLSTATE: database unavailable</pre>");
    });
    const originServer = await createServer((_, response) => {
      response.writeHead(302, {
        Location: `http://destination.fixture.test:${resolveServerPort(destinationServer)}/status`,
      });
      response.end();
    });

    const attachment = await buildFailureScreenshotAttachment(buildMonitor({
      url: `http://origin.fixture.test:${resolveServerPort(originServer)}/redirect`,
      maxRedirects: 5,
    }));

    expect(attachment?.content).toBeInstanceOf(Buffer);
    expect(redirectedRequests).toBeGreaterThan(0);
    expect(assetRequests).toBeGreaterThan(0);
  }, 25_000);

  it("captures visible error content when the document never finishes loading", async () => {
    const server = await createServer((_, response) => {
      response.writeHead(503, { "Content-Type": "text/html" });
      response.write("<!doctype html><body><h1>503 Service Unavailable</h1>");
    });

    const attachment = await buildFailureScreenshotAttachment(buildMonitor({
      url: `http://fixture.test:${resolveServerPort(server)}/partial`,
    }));

    expect(attachment?.content).toBeInstanceOf(Buffer);
  }, 25_000);

  it("does not attach an image when a redirected destination is unreachable", async () => {
    const destinationServer = await createServer((_, response) => response.end());
    const destinationPort = resolveServerPort(destinationServer);
    await closeServer(destinationServer);
    servers.splice(servers.indexOf(destinationServer), 1);
    const originServer = await createServer((_, response) => {
      response.writeHead(302, {
        Location: `http://destination.fixture.test:${destinationPort}/unavailable`,
      });
      response.end();
    });
    const onSkipped = vi.fn();

    const attachment = await buildFailureScreenshotAttachment(buildMonitor({
      url: `http://origin.fixture.test:${resolveServerPort(originServer)}/redirect`,
      maxRedirects: 5,
    }), new Date(), onSkipped);

    expect(attachment).toBeNull();
    expect(onSkipped).toHaveBeenCalledOnce();
  }, 25_000);

  it("blocks a private redirect after a validated public redirect", async () => {
    let privateRequests = 0;
    const privateServer = await createServer((_, response) => {
      privateRequests += 1;
      response.end("Private administration");
    });
    const destinationServer = await createServer((_, response) => {
      response.writeHead(302, { Location: `http://127.0.0.1:${resolveServerPort(privateServer)}/admin` });
      response.end();
    });
    const originServer = await createServer((_, response) => {
      response.writeHead(302, {
        Location: `http://destination.fixture.test:${resolveServerPort(destinationServer)}/redirect`,
      });
      response.end();
    });

    const attachment = await buildFailureScreenshotAttachment(buildMonitor({
      url: `http://origin.fixture.test:${resolveServerPort(originServer)}/redirect`,
      maxRedirects: 5,
    }));

    expect(attachment).toBeNull();
    expect(privateRequests).toBe(0);
  }, 25_000);

  it("skips the screenshot when the hostname cannot be resolved", async () => {
    vi.mocked(resolveMonitorNetworkTargetWithTimeout).mockRejectedValueOnce(
      Object.assign(new Error("hostname lookup failed"), { code: "ENOTFOUND" })
    );
    const onSkipped = vi.fn();

    const attachment = await buildFailureScreenshotAttachment(
      buildMonitor({ url: "https://missing.fixture.test" }),
      new Date("2026-05-15T08:00:00.000Z"),
      onSkipped
    );

    expect(attachment).toBeNull();
    expect(onSkipped).toHaveBeenCalledWith("screenshot target hostname could not be resolved");
  });

  it("does not attach an image when the connection is refused", async () => {
    const server = await createServer((_, response) => response.end());
    const port = resolveServerPort(server);
    await closeServer(server);
    servers.splice(servers.indexOf(server), 1);

    const attachment = await buildFailureScreenshotAttachment(buildMonitor({
      url: `http://fixture.test:${port}/offline`,
    }));

    expect(attachment).toBeNull();
  }, 25_000);

  it("skips the screenshot when the approved target never responds", async () => {
    const hangingServer = await createServer(() => undefined);
    const onSkipped = vi.fn();

    const attachment = await buildFailureScreenshotAttachment(buildMonitor({
      url: `http://fixture.test:${resolveServerPort(hangingServer)}/timeout`,
    }), new Date("2026-05-15T08:00:00.000Z"), onSkipped);

    expect(attachment).toBeNull();
    expect(onSkipped).toHaveBeenCalledOnce();
  }, 25_000);

  it.each(["page", "worker"])("blocks private WebSocket handshakes from %s scripts", async (realm) => {
    let privateRequests = 0;
    let publicRequests = 0;
    let scriptRequests = 0;
    const privateServer = await createServer((_, response) => {
      privateRequests += 1;
      response.end();
    });
    privateServer.on("upgrade", (_request, socket) => {
      privateRequests += 1;
      socket.destroy();
    });
    let script = "";
    const publicServer = await createServer((request, response) => {
      if (request.url === "/executed") {
        scriptRequests += 1;
        response.end("ok");
        return;
      }
      publicRequests += 1;
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(`<h1>Public page</h1><script>${realm === "worker"
        ? `new Worker(URL.createObjectURL(new Blob([${JSON.stringify(script)}], {type: 'text/javascript'})));`
        : script}</script>`);
    });
    script = `new WebSocket('ws://127.0.0.1:${resolveServerPort(privateServer)}/private'); fetch('http://fixture.test:${resolveServerPort(publicServer)}/executed');`;

    const attachment = await buildFailureScreenshotAttachment(buildMonitor({
      url: `http://fixture.test:${resolveServerPort(publicServer)}/socket`,
    }));
    expect(attachment?.content).toBeInstanceOf(Buffer);
    expect(publicRequests).toBeGreaterThan(0);
    expect(scriptRequests).toBeGreaterThan(0);
    expect(privateRequests).toBe(0);
  }, 25_000);
});

function createServer(handler: http.RequestListener) {
  const server = http.createServer(handler);
  servers.push(server);
  return new Promise<http.Server>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : resolve());
  });
}

function resolveServerPort(server: http.Server) {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP test server address.");
  }
  return address.port;
}

function buildMonitor(overrides: Partial<Monitor>): Monitor {
  return {
    id: "monitor-1",
    name: "Website",
    monitorType: "http",
    notificationPref: "email",
    sendOutageScreenshot: true,
    ignoreSslErrors: false,
    allowPrivateTargets: false,
    ...overrides,
  } as Monitor;
}
