import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

afterEach(() => {
  restoreEnvironment();
  vi.resetModules();
});

describe("runtime environment parsing", () => {
  it("clamps worker values so invalid settings cannot create a hot loop", async () => {
    process.env.WORKER_CONCURRENCY = "0";
    process.env.WORKER_POLL_INTERVAL_MS = "-10";

    const { env } = await import("@/lib/env");

    expect(env.workerConcurrency).toBe(1);
    expect(env.workerPollIntervalMs).toBe(1000);
  });

  it("clamps very large worker values to safe upper bounds", async () => {
    process.env.WORKER_CONCURRENCY = "99999";
    process.env.WORKER_POLL_INTERVAL_MS = "9999999";

    const { env } = await import("@/lib/env");

    expect(env.workerConcurrency).toBe(500);
    expect(env.workerPollIntervalMs).toBe(600000);
  });
});

function restoreEnvironment() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, originalEnv);
}
