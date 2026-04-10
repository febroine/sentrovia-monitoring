const DEFAULT_WORKER_CONCURRENCY = 20;
const DEFAULT_WORKER_POLL_INTERVAL_MS = 10_000;
const DEFAULT_DATABASE_URL = "postgres://postgres:postgres@localhost:5433/uptimemonitoring";
const DEFAULT_AUTH_SECRET = "change-me-before-production";
const DEFAULT_APP_ENCRYPTION_SECRET = "change-me-before-production-encryption";
const PLACEHOLDER_SECRET_MARKERS = ["change-me", "replace-this", "replace-with"];

function parseNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readString(value: string | undefined, fallback: string) {
  return value && value.trim().length > 0 ? value : fallback;
}

function parseBoolean(value: string | undefined, fallback = false) {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function isProductionEnvironment() {
  return process.env.NODE_ENV === "production";
}

function isUnsafeSecret(value: string, fallback: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length < 32 ||
    normalized === fallback.toLowerCase() ||
    PLACEHOLDER_SECRET_MARKERS.some((marker) => normalized.includes(marker))
  );
}

function ensureProductionSecret(name: string, value: string, fallback: string) {
  if (isProductionEnvironment() && isUnsafeSecret(value, fallback)) {
    throw new Error(`${name} must be configured with a strong non-placeholder value in production.`);
  }

  return value;
}

function buildDatabaseUrlFromParts() {
  const host = readString(process.env.POSTGRES_HOST, "localhost");
  const port = readString(process.env.POSTGRES_PORT, "5433");
  const user = readString(process.env.POSTGRES_USER, "postgres");
  const password = readString(process.env.POSTGRES_PASSWORD, "postgres");
  const database = readString(process.env.POSTGRES_DB, "uptimemonitoring");

  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export function getDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL;
  }

  if (
    process.env.POSTGRES_HOST ||
    process.env.POSTGRES_PORT ||
    process.env.POSTGRES_USER ||
    process.env.POSTGRES_PASSWORD ||
    process.env.POSTGRES_DB
  ) {
    return buildDatabaseUrlFromParts();
  }

  return DEFAULT_DATABASE_URL;
}

export function getAuthSecret() {
  return ensureProductionSecret("AUTH_SECRET", readString(process.env.AUTH_SECRET, DEFAULT_AUTH_SECRET), DEFAULT_AUTH_SECRET);
}

export function getAppEncryptionSecret() {
  return ensureProductionSecret(
    "APP_ENCRYPTION_SECRET",
    readString(process.env.APP_ENCRYPTION_SECRET, DEFAULT_APP_ENCRYPTION_SECRET),
    DEFAULT_APP_ENCRYPTION_SECRET
  );
}

export const env = {
  appUrl: readString(process.env.APP_URL, "http://localhost:3000"),
  isProduction: process.env.NODE_ENV === "production",
  workerConcurrency: parseNumber(process.env.WORKER_CONCURRENCY, DEFAULT_WORKER_CONCURRENCY),
  workerPollIntervalMs: parseNumber(process.env.WORKER_POLL_INTERVAL_MS, DEFAULT_WORKER_POLL_INTERVAL_MS),
  workerAutoStart: parseBoolean(process.env.WORKER_AUTO_START, false),
  disableEmbeddedWorkerSpawn: parseBoolean(process.env.DISABLE_EMBEDDED_WORKER_SPAWN, false),
};
