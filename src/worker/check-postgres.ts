import postgres from "postgres";
import type { Monitor } from "@/lib/db/schema";
import { parsePostgresMonitorTarget } from "@/lib/monitors/targets";
import { decryptValue } from "@/lib/security/encryption";
import type { CheckResult } from "@/worker/types";

export async function checkPostgresMonitor(monitor: Monitor): Promise<CheckResult> {
  const checkedAt = new Date();
  const target = parsePostgresMonitorTarget(monitor.url);
  const password = decryptValue(monitor.databasePasswordEncrypted);

  if (!target.host || !target.databaseName || !target.databaseUsername || !password) {
    return buildFailure(checkedAt, "Database credentials are incomplete.");
  }

  const connection = postgres(buildConnectionString(target, password), {
    connect_timeout: Math.max(1, Math.ceil(monitor.timeout / 1000)),
    idle_timeout: 0,
    max: 1,
    prepare: false,
    ssl: monitor.databaseSsl ? "require" : false,
  });
  const timeoutGuard = createTimeoutGuard(
    monitor.timeout,
    "Database check timed out before the query completed."
  );

  try {
    await Promise.race([connection`select 1 as ok`, timeoutGuard.promise]);

    return buildSuccess(checkedAt);
  } catch (error) {
    return buildFailure(checkedAt, error instanceof Error ? error.message : "Database check failed.");
  } finally {
    timeoutGuard.cancel();
    await connection.end().catch(() => undefined);
  }
}

function buildConnectionString(
  target: ReturnType<typeof parsePostgresMonitorTarget>,
  password: string
) {
  const username = encodeURIComponent(target.databaseUsername);
  const secret = encodeURIComponent(password);
  const databaseName = encodeURIComponent(target.databaseName);
  const host = target.host.includes(":") ? `[${target.host}]` : target.host;

  return `postgres://${username}:${secret}@${host}:${target.port}/${databaseName}`;
}

function createTimeoutGuard(timeout: number, message: string) {
  const timeoutId = setTimeout(() => {
    rejectTimeout?.(new Error(message));
  }, timeout);
  let rejectTimeout: ((error: Error) => void) | null = null;
  const promise = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
  });

  return {
    promise,
    cancel() {
      clearTimeout(timeoutId);
      rejectTimeout = null;
    },
  };
}

function buildSuccess(checkedAt: Date): CheckResult {
  return {
    ok: true,
    status: "up",
    statusCode: null,
    errorMessage: null,
    checkedAt,
    latencyMs: Math.max(1, Date.now() - checkedAt.getTime()),
    sslExpiresAt: null,
  };
}

function buildFailure(checkedAt: Date, errorMessage: string): CheckResult {
  return {
    ok: false,
    status: "down",
    statusCode: null,
    errorMessage,
    checkedAt,
    latencyMs: Math.max(1, Date.now() - checkedAt.getTime()),
    sslExpiresAt: null,
  };
}
