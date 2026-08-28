import crypto from "node:crypto";
import { spawn } from "node:child_process";

const rootDirectory = new URL("../..", import.meta.url);
const runId = `run${Date.now().toString(36)}${crypto.randomBytes(5).toString("hex")}`;
const accountCommand = [
  "compose",
  "exec",
  "-T",
  "-e",
  `SENTROVIA_E2E_RUN_ID=${runId}`,
  "web",
  "node",
  "tests/e2e/manage-dynamic-test-account.mjs",
];

let account;
let suiteError;

try {
  await runCommand(
    "docker",
    ["compose", "cp", "tests/e2e/manage-dynamic-test-account.mjs", "web:/app/tests/e2e/manage-dynamic-test-account.mjs"],
    process.env,
    false
  );
  const created = await runCommand("docker", [...accountCommand, "create"], process.env, false);
  account = parseTestAccount(created.stdout);
  const environment = {
    ...process.env,
    SENTROVIA_E2E_USERNAME: account.username,
    SENTROVIA_E2E_PASSWORD: account.password,
  };

  await runCommand(process.execPath, ["tests/e2e/docker-runtime.mjs"], environment);
  await runCommand(process.execPath, ["tests/e2e/ui-interactions.mjs"], environment);
} catch (error) {
  suiteError = error;
} finally {
  try {
    await runCommand("docker", [...accountCommand, "cleanup"], process.env, false);
  } catch (cleanupError) {
    if (!suiteError) {
      suiteError = cleanupError;
    } else {
      console.error("[dynamic-e2e] Temporary account cleanup failed.", cleanupError);
    }
  }
}

if (suiteError) {
  throw suiteError;
}

console.log("[dynamic-e2e] Completed with an isolated temporary admin account.");

function runCommand(command, args, environment = process.env, forwardOutput = true) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDirectory,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (forwardOutput) process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (forwardOutput) process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}.`));
    });
  });
}

function parseTestAccount(output) {
  const jsonLine = output
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.trim().startsWith("{"));
  if (!jsonLine) {
    throw new Error("Dynamic E2E account creation did not return credentials.");
  }

  const account = JSON.parse(jsonLine);
  if (!account.username || !account.password) {
    throw new Error("Dynamic E2E account credentials are incomplete.");
  }

  return account;
}
