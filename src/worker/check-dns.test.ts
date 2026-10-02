import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Monitor } from "@/lib/db/schema";

const resolver = vi.hoisted(() => ({
  servers: [] as string[],
  resolve4: vi.fn(),
  resolve6: vi.fn(),
  resolveCname: vi.fn(),
  resolveNs: vi.fn(),
  resolveMx: vi.fn(),
  resolveTxt: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  Resolver: class {
    setServers(servers: string[]) { resolver.servers = servers; }
    resolve4(host: string) { return resolver.resolve4(host); }
    resolve6(host: string) { return resolver.resolve6(host); }
    resolveCname(host: string) { return resolver.resolveCname(host); }
    resolveNs(host: string) { return resolver.resolveNs(host); }
    resolveMx(host: string) { return resolver.resolveMx(host); }
    resolveTxt(host: string) { return resolver.resolveTxt(host); }
    cancel() { resolver.cancel(); }
  },
}));

import { checkDnsMonitor } from "@/worker/check-dns";

function monitor(url: string, overrides: Partial<Monitor> = {}) {
  return { url, timeout: 5_000, dnsExpectedValues: null, dnsMatchMode: "includes", ...overrides } as Monitor;
}

function dnsError(code: string) {
  return Object.assign(new Error(`query ${code}`), { code });
}

describe("checkDnsMonitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolver.servers = [];
  });

  it("is up when the record exists", async () => {
    resolver.resolve4.mockResolvedValue(["93.184.216.34"]);

    const result = await checkDnsMonitor(monitor("dns://example.com/A"));

    expect(result).toMatchObject({ ok: true, status: "up", statusCode: null, errorMessage: null });
    expect(result.latencyMs).toBeGreaterThan(0);
    expect(resolver.resolve4).toHaveBeenCalledWith("example.com");
  });

  it("asks the chosen DNS server", async () => {
    resolver.resolveMx.mockResolvedValue([{ priority: 10, exchange: "Mail.Example.com" }]);

    const result = await checkDnsMonitor(monitor("dns://example.com/MX?server=1.1.1.1", { dnsExpectedValues: "mail.example.com", dnsMatchMode: "exact" }));

    expect(resolver.servers).toEqual(["1.1.1.1"]);
    expect(result.status).toBe("up");
  });

  it("is down with an assertion failure when an expected value is missing", async () => {
    resolver.resolveTxt.mockResolvedValue([["v=spf1 ", "include:_spf.other.com ~all"]]);

    const result = await checkDnsMonitor(monitor("dns://example.com/TXT", { dnsExpectedValues: "include:_spf.example.com" }));

    expect(result).toMatchObject({
      status: "down",
      failureReason: "assertion",
      errorMessage: "TXT records for example.com do not include include:_spf.example.com. Found: v=spf1 include:_spf.other.com ~all.",
    });
  });

  it("explains a missing name and missing records", async () => {
    resolver.resolve4.mockRejectedValueOnce(dnsError("ENOTFOUND"));
    resolver.resolveCname.mockRejectedValueOnce(dnsError("ENODATA"));

    expect(await checkDnsMonitor(monitor("dns://gone.example.com/A"))).toMatchObject({
      status: "down",
      failureReason: "dns",
      errorMessage: "gone.example.com does not exist (NXDOMAIN).",
    });
    expect(await checkDnsMonitor(monitor("dns://www.example.com/CNAME"))).toMatchObject({
      failureReason: "dns",
      errorMessage: "No CNAME records for www.example.com were returned.",
    });
  });

  it("gives up at the monitor timeout", async () => {
    resolver.resolve4.mockReturnValue(new Promise(() => undefined));

    const result = await checkDnsMonitor(monitor("dns://slow.example.com/A?server=9.9.9.9", { timeout: 1_000 }));

    expect(result).toMatchObject({ status: "down", failureReason: "timeout", errorMessage: "DNS server 9.9.9.9 did not answer within 1s." });
    expect(resolver.cancel).toHaveBeenCalled();
  });

  it("follows the network safety policy", async () => {
    resolver.resolve4.mockResolvedValue(["10.0.0.5"]);

    expect(await checkDnsMonitor(monitor("dns://intranet.example.com/A"))).toMatchObject({
      status: "down",
      failureReason: "configuration",
      errorMessage: "intranet.example.com resolves to a non-public address, which the current network safety policy does not allow.",
    });
    expect((await checkDnsMonitor(monitor("dns://intranet.example.com/A"), true)).status).toBe("up");
    expect(await checkDnsMonitor(monitor("dns://example.com/A?server=10.0.0.53"))).toMatchObject({ failureReason: "configuration" });
  });

  it("asks public resolvers instead of the server's own DNS without private-target access", async () => {
    resolver.resolveCname.mockResolvedValue(["db.internal.example"]);

    await checkDnsMonitor(monitor("dns://corp-db.example.com/CNAME"));
    expect(resolver.servers).toEqual(["1.1.1.1", "8.8.8.8"]);

    resolver.servers = [];
    await checkDnsMonitor(monitor("dns://corp-db.example.com/CNAME"), true);
    expect(resolver.servers).toEqual([]);
  });
});
