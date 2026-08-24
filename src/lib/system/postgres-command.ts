import { spawn } from "node:child_process";

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
  label: string
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env: environment, shell: false, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < 4_096) stderr += String(chunk);
    });
    child.on("error", (error) => reject(new Error(`${label} could not start: ${error.message}`)));
    child.on("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(`${label} failed with exit code ${code ?? "unknown"}: ${stderr.trim() || "no details"}`)));
  });
}

function copySearchParameter(url: URL, parameter: string, environment: NodeJS.ProcessEnv, variable: string) {
  const value = url.searchParams.get(parameter);
  if (value) environment[variable] = value;
}
