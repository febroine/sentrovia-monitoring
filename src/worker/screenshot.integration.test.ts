import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monitor } from "@/lib/db/schema";

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

    await buildFailureScreenshotAttachment(buildMonitor({
      url: `http://fixture.test:${resolveServerPort(publicServer)}/redirect`,
    }));

    expect(privateRequests).toBe(0);
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
