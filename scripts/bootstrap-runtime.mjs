import { spawn } from "node:child_process";
import process from "node:process";
import postgres from "postgres";

const mode = process.argv[2];
const MAX_DB_ATTEMPTS = 30;
const RETRY_DELAY_MS = 2_000;
const DATABASE_URL = process.env.DATABASE_URL;

if (!mode || !["web", "worker"].includes(mode)) {
  console.error("Usage: node scripts/bootstrap-runtime.mjs <web|worker>");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("DATABASE_URL is missing. Sentrovia cannot start without a database connection.");
  process.exit(1);
}

await waitForDatabase(DATABASE_URL);

if (mode === "web") {
  await runStep("npm", ["run", "db:push"], "Applying database schema");
  runForeground("npm", ["run", "start"]);
} else {
  runForeground("npm", ["run", "worker:start"]);
}

async function waitForDatabase(connectionString) {
  for (let attempt = 1; attempt <= MAX_DB_ATTEMPTS; attempt += 1) {
    const client = postgres(connectionString, {
      max: 1,
      idle_timeout: 1,
      connect_timeout: 5,
      prepare: false,
    });

    try {
      await client`select 1`;
      await client.end({ timeout: 1 });
      console.log(`Database is ready after ${attempt} attempt(s).`);
      return;
    } catch (error) {
      await client.end({ timeout: 1 }).catch(() => undefined);

      if (attempt === MAX_DB_ATTEMPTS) {
        console.error("Database did not become ready in time.");
        console.error(error instanceof Error ? error.message : "Unknown database error");
        process.exit(1);
      }

      console.log(`Waiting for PostgreSQL... attempt ${attempt}/${MAX_DB_ATTEMPTS}`);
      await delay(RETRY_DELAY_MS);
    }
  }
}

function runStep(command, args, label) {
  console.log(`${label}...`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: true,
      env: process.env,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${label} failed with exit code ${code ?? "unknown"}.`));
    });
    child.on("error", reject);
  });
}

function runForeground(command, args) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  child.on("exit", (code) => {
    process.exit(code ?? 1);
  });
  child.on("error", (error) => {
    console.error(error instanceof Error ? error.message : "Unable to start runtime.");
    process.exit(1);
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
