import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postgres: vi.fn(),
  assertTarget: vi.fn(),
  decryptValue: vi.fn(),
}));

vi.mock("postgres", () => ({ default: mocks.postgres }));
vi.mock("@/lib/env", () => ({ env: { monitorAllowPrivateTargets: true } }));
vi.mock("@/lib/security/encryption", () => ({ decryptValue: mocks.decryptValue }));
vi.mock("@/lib/security/public-network-target", () => ({
  assertMonitorNetworkTargetWithTimeout: mocks.assertTarget,
}));

import { checkPostgresMonitor } from "@/worker/check-postgres";

describe("PostgreSQL monitor checks", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("closes a successful connection without waiting indefinitely", async () => {
    const connection = createConnection();
    connection.mockResolvedValue([{ ok: 1 }]);
    mocks.postgres.mockReturnValue(connection);
    mocks.decryptValue.mockReturnValue("secret");

    const result = await checkPostgresMonitor(buildMonitor());

    expect(result.ok).toBe(true);
    expect(connection.end).toHaveBeenCalledWith({ timeout: 0 });
  });

  it("returns the configured timeout result while force-closing a stalled connection", async () => {
    vi.useFakeTimers();
    const connection = createConnection();
    connection.mockReturnValue(new Promise(() => undefined));
    mocks.postgres.mockReturnValue(connection);
    mocks.decryptValue.mockReturnValue("secret");

    const pendingCheck = checkPostgresMonitor(buildMonitor({ timeout: 25 }));
    await vi.advanceTimersByTimeAsync(25);
    const result = await pendingCheck;

    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe("timeout");
    expect(connection.end).toHaveBeenCalledWith({ timeout: 0 });
  });
});

function createConnection() {
  const query = vi.fn();
  return Object.assign(query, { end: vi.fn().mockResolvedValue(undefined) });
}

function buildMonitor(overrides: { timeout?: number } = {}) {
  return {
    url: "postgres://monitor_user@db.example:5432/sentrovia",
    databasePasswordEncrypted: "encrypted-secret",
    databaseSsl: false,
    timeout: overrides.timeout ?? 1_000,
  } as never;
}
