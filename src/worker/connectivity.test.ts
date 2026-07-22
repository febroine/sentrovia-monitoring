import { afterEach, describe, expect, it, vi } from "vitest";
import { probeWorkerConnectivity } from "@/worker/connectivity";

describe("worker connectivity guard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats any HTTP response as proof of internet connectivity", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce({ status: 503 })
      .mockRejectedValueOnce(new Error("network unavailable"));

    const result = await probeWorkerConnectivity(
      ["https://one.example", "https://two.example", "https://three.example"],
      1000,
      fetchImpl
    );

    expect(result).toMatchObject({
      available: true,
      status: "online",
      successfulTargets: 1,
      totalTargets: 3,
    });
  });

  it("pauses monitoring only when every independent canary fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network unavailable"));

    const result = await probeWorkerConnectivity(
      ["https://one.example", "https://two.example", "https://three.example"],
      1000,
      fetchImpl
    );

    expect(result).toMatchObject({
      available: false,
      status: "offline",
      successfulTargets: 0,
      totalTargets: 3,
    });
    expect(result.message).toContain("Monitoring and outbound worker tasks are paused");
  });

  it("returns as soon as one canary responds instead of waiting for slower failures", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((target: string) => (
      target.includes("fast")
        ? Promise.resolve({ status: 204 })
        : new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10_000))
    ));

    const resultPromise = probeWorkerConnectivity(
      ["https://slow-one.example", "https://fast.example", "https://slow-two.example"],
      5_000,
      fetchImpl
    );
    await vi.advanceTimersByTimeAsync(0);

    await expect(resultPromise).resolves.toMatchObject({ available: true });
  });
});
