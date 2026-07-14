import { lookup } from "node:dns/promises";
import { describe, expect, it, vi } from "vitest";
import {
  assertMonitorNetworkTarget,
  assertPublicNetworkTarget,
  isNonPublicIpAddress,
  isMonitorNetworkHostnameLiteralAllowed,
  isPublicNetworkHostnameLiteral,
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
    "::ffff:127.0.0.1",
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

  it.each(["localhost", "127.0.0.1", "169.254.169.254", "metadata.google.internal"])(
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
});
