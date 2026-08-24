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
  resolveMonitorNetworkTargetWithTimeout: mocks.assertTarget,
  selectResolvedAddress: vi.fn(() => "203.0.113.10"),
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
    mocks.assertTarget.mockResolvedValue(buildResolvedTarget());

    const result = await checkPostgresMonitor(buildMonitor());

    expect(result.ok).toBe(true);
    expect(connection.end).toHaveBeenCalledWith({ timeout: 0 });
    expect(mocks.postgres).toHaveBeenCalledWith(
      expect.stringContaining("@203.0.113.10:5432/"),
      expect.objectContaining({
        ssl: {
          rejectUnauthorized: true,
          servername: "db.example",
        },
      })
    );
  });

  it("returns the configured timeout result while force-closing a stalled connection", async () => {
    vi.useFakeTimers();
    const connection = createConnection();
    connection.mockReturnValue(new Promise(() => undefined));
    mocks.postgres.mockReturnValue(connection);
    mocks.decryptValue.mockReturnValue("secret");
    mocks.assertTarget.mockResolvedValue(buildResolvedTarget());

    const pendingCheck = checkPostgresMonitor(buildMonitor({ timeout: 25 }));
    await vi.advanceTimersByTimeAsync(25);
    const result = await pendingCheck;

    expect(result.ok).toBe(false);
    expect(result.failureReason).toBe("timeout");
    expect(connection.end).toHaveBeenCalledWith({ timeout: 0 });
  });
});

function buildResolvedTarget() {
  return {
    hostname: "db.example.com",
    addresses: [{ address: "203.0.113.10", family: 4 as const }],
  };
}

function createConnection() {
  const query = vi.fn();
  return Object.assign(query, { end: vi.fn().mockResolvedValue(undefined) });
}

function buildMonitor(overrides: { timeout?: number; databaseTlsVerify?: boolean } = {}) {
  return {
    url: "postgres://monitor_user@db.example:5432/sentrovia",
    databasePasswordEncrypted: "encrypted-secret",
    databaseSsl: true,
    databaseTlsVerify: overrides.databaseTlsVerify ?? true,
    timeout: overrides.timeout ?? 1_000,
  } as never;
}
