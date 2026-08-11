import postgres from "postgres";
import type { Monitor } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { parsePostgresMonitorTarget } from "@/lib/monitors/targets";
import { decryptValue } from "@/lib/security/encryption";
import { assertMonitorNetworkTargetWithTimeout } from "@/lib/security/public-network-target";
import { classifyFailureMessage } from "@/worker/failure-reasons";
import type { CheckFailureReason, CheckResult } from "@/worker/types";

const MONITOR_PUBLIC_TARGET_ERROR = "Monitor target is not allowed by the current network safety policy.";

export async function checkPostgresMonitor(monitor: Monitor): Promise<CheckResult> {
  const checkedAt = new Date();
  let target: ReturnType<typeof parsePostgresMonitorTarget>;
  let password: string | null;

  try {
    target = parsePostgresMonitorTarget(monitor.url);
    password = decryptValue(monitor.databasePasswordEncrypted);
  } catch (error) {
    return buildFailure(
      checkedAt,
      error instanceof Error ? error.message : "Database configuration could not be read.",
      "configuration"
    );
  }

  if (!target.host || !target.databaseName || !target.databaseUsername || !password) {
    return buildFailure(checkedAt, "Database credentials are incomplete.", "configuration");
  }

  try {
    await assertMonitorNetworkTargetWithTimeout(target.host, {
      allowPrivateTargets: env.monitorAllowPrivateTargets,
      message: MONITOR_PUBLIC_TARGET_ERROR,
    }, monitor.timeout);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database check failed.";
    return buildFailure(checkedAt, message, classifyFailureMessage(message, "database"));
  }

  const remainingTimeoutMs = monitor.timeout - (Date.now() - checkedAt.getTime());
  if (remainingTimeoutMs <= 0) {
    return buildFailure(
      checkedAt,
      "Database check timed out before the query completed.",
      "timeout"
    );
  }

  const connection = postgres(buildConnectionString(target, password), {
    connect_timeout: Math.max(1, Math.ceil(remainingTimeoutMs / 1000)),
    idle_timeout: 0,
    max: 1,
    prepare: false,
    ssl: monitor.databaseSsl ? "require" : false,
  });
  const timeoutGuard = createTimeoutGuard(
    remainingTimeoutMs,
    "Database check timed out before the query completed."
  );

  try {
    await Promise.race([connection`select 1 as ok`, timeoutGuard.promise]);

    return buildSuccess(checkedAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database check failed.";
    return buildFailure(checkedAt, message, classifyFailureMessage(message, "database"));
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

function buildFailure(
  checkedAt: Date,
  errorMessage: string,
  failureReason: CheckFailureReason
): CheckResult {
  return {
    ok: false,
    status: "down",
    statusCode: null,
    errorMessage,
    failureReason,
    checkedAt,
    latencyMs: Math.max(1, Date.now() - checkedAt.getTime()),
    sslExpiresAt: null,
  };
}
