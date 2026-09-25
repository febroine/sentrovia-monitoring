import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = resolve(import.meta.dirname, "auto-update-windows-nssm.ps1");
const previousCommit = "a".repeat(40);
const targetCommit = "b".repeat(40);
const fixtures = [];

function psString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runUpdate({
  conclusion = "success", failBackup = false, failUpdater = false, failedBefore = false, interrupted = false,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "sentrovia-auto-update-"));
  fixtures.push(root);
  mkdirSync(join(root, "logs"));
  mkdirSync(join(root, "scripts"));
  writeFileSync(join(root, "logs", "auto-update-deployed-commit"), previousCommit);
  if (failedBefore) writeFileSync(join(root, "logs", "auto-update-failed-commit"), targetCommit);
  writeFileSync(join(root, "scripts", "update-windows-nssm.ps1"),
    `param([string]$ProjectRoot)\n$global:LASTEXITCODE = ${failUpdater ? 1 : 0}\n`);

  const harness = `
$global:currentCommit = ${psString(interrupted ? targetCommit : previousCommit)}
function git {
  $global:LASTEXITCODE = 0
  switch ($args[4]) {
    'remote' { return 'https://github.com/febroine/sentrovia-monitoring.git' }
    'status' { return }
    'rev-parse' {
      if ($args[5] -eq 'FETCH_HEAD') { return ${psString(targetCommit)} }
      return $global:currentCommit
    }
    'fetch' { return }
    'merge-base' { return }
    'checkout' { $global:currentCommit = $args[-1]; return }
    default { throw "Unexpected git command: $($args[4])" }
  }
}
function npm { $global:LASTEXITCODE = ${failBackup ? 1 : 0} }
function Invoke-RestMethod {
  return [pscustomobject]@{ workflow_runs = @([pscustomobject]@{
    id = 1; head_sha = ${psString(targetCommit)}; head_branch = 'main';
    event = 'push'; status = 'completed'; conclusion = ${psString(conclusion)}
  }) }
}
& ${psString(scriptPath)} -ProjectRoot ${psString(root)}
exit $LASTEXITCODE
`;
  const harnessPath = join(root, "run.ps1");
  writeFileSync(harnessPath, harness);
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", harnessPath], {
    encoding: "utf8",
    timeout: 30_000,
  });
  return {
    root,
    result,
    deployed: readFileSync(join(root, "logs", "auto-update-deployed-commit"), "utf8"),
    log: readFileSync(join(root, "logs", "auto-update.log"), "utf8"),
  };
}

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    if (!resolve(root).startsWith(`${resolve(tmpdir())}\\sentrovia-auto-update-`)) {
      throw new Error(`Unsafe fixture path: ${root}`);
    }
    rmSync(root, { recursive: true, force: true });
  }
});

const windowsDescribe = process.platform === "win32" ? describe : describe.skip;

windowsDescribe("Windows NSSM automatic deployment", () => {
  it("waits for a successful CI run before changing the deployed commit", () => {
    const result = runUpdate({ conclusion: "failure" });
    expect(result.result.status).toBe(0);
    expect(result.deployed).toBe(previousCommit);
    expect(result.log).toContain("Waiting for successful CI");
  }, 30_000);

  it("records the deployed commit only after the updater succeeds", () => {
    const result = runUpdate();
    expect(result.result.status).toBe(0);
    expect(result.deployed).toBe(targetCommit);
    expect(result.log).toContain(`Deployed ${targetCommit} successfully`);
  }, 30_000);

  it("does not switch commits when the verified backup fails", () => {
    const result = runUpdate({ failBackup: true });
    expect(result.result.status).toBe(1);
    expect(result.deployed).toBe(previousCommit);
    expect(result.log).toContain("The pre-update database backup failed");
  }, 30_000);

  it("rolls source back and prevents repeated attempts after an updater failure", () => {
    const result = runUpdate({ failUpdater: true });
    expect(result.result.status).toBe(1);
    expect(result.deployed).toBe(previousCommit);
    expect(readFileSync(join(result.root, "logs", "auto-update-failed-commit"), "utf8")).toBe(targetCommit);
    expect(result.log).toContain(`restoring source commit ${previousCommit}`);
  }, 30_000);

  it("does not retry a failed commit on each scheduled check", () => {
    const result = runUpdate({ failedBefore: true });
    expect(result.result.status).toBe(0);
    expect(result.deployed).toBe(previousCommit);
    expect(result.log).toContain("previously failed");
    expect(result.log).not.toContain("Creating a verified database backup");
  }, 30_000);

  it("refuses to treat an interrupted checkout as a completed deployment", () => {
    const result = runUpdate({ interrupted: true });
    expect(result.result.status).toBe(1);
    expect(result.deployed).toBe(previousCommit);
    expect(result.log).toContain("Recover the interrupted update manually");
  }, 30_000);
});
