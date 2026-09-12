import { spawn } from "node:child_process";

const POSTGRES_COMMAND_TIMEOUT_MS = 30 * 60_000;
const POSTGRES_TERMINATION_GRACE_MS = 5_000;
const POSTGRES_FORCED_TERMINATION_WAIT_MS = 5_000;

export function buildPostgresCommandEnvironment(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres protocol for database backups.");
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!parsed.hostname || !databaseName || !parsed.username) {
    throw new Error("DATABASE_URL is missing the host, database, or username required for backups.");
  }

  const environment: NodeJS.ProcessEnv = { ...process.env };
  if (parsed.password) environment.PGPASSWORD = decodeURIComponent(parsed.password);
  copySearchParameter(parsed, "sslmode", environment, "PGSSLMODE");
  copySearchParameter(parsed, "sslrootcert", environment, "PGSSLROOTCERT");
  copySearchParameter(parsed, "sslcert", environment, "PGSSLCERT");
  copySearchParameter(parsed, "sslkey", environment, "PGSSLKEY");

  return {
    args: [
      "--host", parsed.hostname,
      "--port", parsed.port || "5432",
      "--username", decodeURIComponent(parsed.username),
      "--dbname", databaseName,
    ],
    environment,
  };
}

export function runPostgresCommand(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  label: string,
  options: {
    timeoutMs?: number;
    terminationGraceMs?: number;
    forcedTerminationWaitMs?: number;
  } = {}
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env: environment, shell: false, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let forcedTerminationRequested = false;
    let terminationFailure: string | null = null;
    const timeoutMs = Math.max(1, options.timeoutMs ?? POSTGRES_COMMAND_TIMEOUT_MS);
    const terminationGraceMs = Math.max(1, options.terminationGraceMs ?? POSTGRES_TERMINATION_GRACE_MS);
    const forcedTerminationWaitMs = Math.max(
      1,
      options.forcedTerminationWaitMs ?? POSTGRES_FORCED_TERMINATION_WAIT_MS
    );
    let terminationTimer: ReturnType<typeof setTimeout> | null = null;
    let forcedTerminationTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);
      if (terminationTimer) clearTimeout(terminationTimer);
      if (forcedTerminationTimer) clearTimeout(forcedTerminationTimer);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const buildTimeoutError = (terminationUnconfirmed = false) => {
      const stderrSuffix = stderr.trim() ? `: ${stderr.trim()}` : "";
      const terminationSuffix = terminationUnconfirmed
        ? ` Termination could not be confirmed${terminationFailure ? ` (${terminationFailure})` : ""}.`
        : "";
      return new Error(`${label} timed out after ${formatTimeout(timeoutMs)}.${terminationSuffix}${stderrSuffix}`);
    };
    const requestKill = (signal: NodeJS.Signals) => {
      try {
        const accepted = child.kill(signal);
        if (!accepted) {
          terminationFailure = `${signal} was not accepted`;
        }
        return accepted;
      } catch (error) {
        terminationFailure = error instanceof Error ? error.message : `${signal} failed`;
        return false;
      }
    };
    const forceTermination = () => {
      if (settled || forcedTerminationRequested) {
        return;
      }

      forcedTerminationRequested = true;
      if (terminationTimer) {
        clearTimeout(terminationTimer);
        terminationTimer = null;
      }
      requestKill("SIGKILL");
      forcedTerminationTimer = setTimeout(
        () => finish(buildTimeoutError(true)),
        forcedTerminationWaitMs
      );
    };
    const timeoutId = setTimeout(() => {
      timedOut = true;
      if (requestKill("SIGTERM")) {
        terminationTimer = setTimeout(forceTermination, terminationGraceMs);
      } else {
        forceTermination();
      }
    }, timeoutMs);

    child.stderr?.on("data", (chunk) => {
      if (stderr.length < 4_096) stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (!timedOut) {
        finish(new Error(`${label} could not start: ${error.message}`));
        return;
      }

      terminationFailure = error.message;
      forceTermination();
    });
    child.on("close", (code) => {
      if (timedOut) {
        finish(buildTimeoutError());
        return;
      }

      if (code === 0) {
        finish();
      } else {
        finish(new Error(`${label} failed with exit code ${code ?? "unknown"}: ${stderr.trim() || "no details"}`));
      }
    });
  });
}

function formatTimeout(timeoutMs: number) {
  if (timeoutMs < 1_000) {
    return `${timeoutMs}ms`;
  }

  const timeoutSeconds = timeoutMs / 1_000;
  return Number.isInteger(timeoutSeconds) ? `${timeoutSeconds}s` : `${timeoutSeconds.toFixed(1)}s`;
}

function copySearchParameter(url: URL, parameter: string, environment: NodeJS.ProcessEnv, variable: string) {
  const value = url.searchParams.get(parameter);
  if (value) environment[variable] = value;
}
