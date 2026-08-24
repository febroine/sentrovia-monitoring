import { lookup } from "node:dns/promises";
import { describe, expect, it, vi } from "vitest";
import {
  assertMonitorNetworkTarget,
  assertMonitorNetworkTargetWithTimeout,
  assertPublicNetworkTarget,
  createPinnedLookup,
  isNonPublicIpAddress,
  isMonitorNetworkHostnameLiteralAllowed,
  isPublicNetworkHostnameLiteral,
  resolvePublicNetworkTarget,
} from "@/lib/security/public-network-target";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

describe("public network target safety", () => {
  it("accepts public IP literal targets", async () => {
    await expect(assertPublicNetworkTarget("8.8.8.8")).resolves.toBeUndefined();
  });

  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.10",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fec0::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "0:0:0:0:0:ffff:7f00:1",
    "0:0:0:0:0:ffff:a00:1",
    "64:ff9b::7f00:1",
  ])("classifies %s as non-public", (address) => {
    expect(isNonPublicIpAddress(address)).toBe(true);
  });

  it.each(["localhost", "metadata.google.internal", "printer.local", "intranet"])(
    "rejects blocked host literal %s without DNS",
    (hostname) => {
      expect(isPublicNetworkHostnameLiteral(hostname)).toBe(false);
    }
  );

  it.each(["10.0.0.5", "192.168.1.10", "intranet", "printer.local"])(
    "allows internal monitor target %s when private targets are enabled",
    (hostname) => {
      expect(isMonitorNetworkHostnameLiteralAllowed(hostname, true)).toBe(true);
    }
  );

  it.each([
    "localhost",
    "127.0.0.1",
    "169.254.169.254",
    "0:0:0:0:0:ffff:7f00:1",
    "metadata.google.internal",
  ])(
    "still blocks server-local monitor target %s when private targets are enabled",
    (hostname) => {
      expect(isMonitorNetworkHostnameLiteralAllowed(hostname, true)).toBe(false);
    }
  );

  it("rejects public-only assertion for private targets", async () => {
    await expect(assertPublicNetworkTarget("10.0.0.5")).rejects.toThrow();
  });

  it("allows private monitor assertion when private targets are enabled", async () => {
    await expect(
      assertMonitorNetworkTarget("10.0.0.5", { allowPrivateTargets: true })
    ).resolves.toBeUndefined();
  });

  it("allows unresolved monitor hostnames during monitor creation", async () => {
    vi.mocked(lookup).mockRejectedValueOnce(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }));

    await expect(
      assertMonitorNetworkTarget("missing.example", {
        allowPrivateTargets: true,
        allowUnresolved: true,
      })
    ).resolves.toBeUndefined();
  });

  it("allows unresolved public-only monitor hostnames during monitor creation", async () => {
    vi.mocked(lookup).mockRejectedValueOnce(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }));

    await expect(
      assertMonitorNetworkTarget("missing.example", {
        allowPrivateTargets: false,
        allowUnresolved: true,
      })
    ).resolves.toBeUndefined();
  });

  it("preserves DNS errors for runtime monitor checks", async () => {
    const dnsError = Object.assign(new Error("getaddrinfo ENOTFOUND missing.example"), { code: "ENOTFOUND" });
    vi.mocked(lookup).mockRejectedValueOnce(dnsError);

    await expect(
      assertMonitorNetworkTarget("missing.example", { allowPrivateTargets: true })
    ).rejects.toMatchObject({ code: "ENOTFOUND" });
  });

  it("bounds runtime DNS resolution with the monitor timeout", async () => {
    vi.useFakeTimers();
    vi.mocked(lookup).mockReturnValueOnce(new Promise(() => undefined) as never);

    const pendingCheck = assertMonitorNetworkTargetWithTimeout(
      "slow.example",
      { allowPrivateTargets: true },
      25
    );
    const rejection = expect(pendingCheck).rejects.toThrow("resolution timed out");
    await vi.advanceTimersByTimeAsync(25);

    await rejection;
    vi.useRealTimers();
  });

  it("pins the validated DNS answer for the eventual socket connection", async () => {
    vi.mocked(lookup).mockClear();
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: "8.8.8.8", family: 4 },
    ] as never);
    const target = await resolvePublicNetworkTarget("dns.example");
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: "127.0.0.1", family: 4 },
    ] as never);

    const address = await new Promise<string>((resolve, reject) => {
      createPinnedLookup(target)("dns.example", { family: 4 }, (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result as string);
      });
    });

    expect(address).toBe("8.8.8.8");
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
