import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");
const manifestPath = resolve(projectRoot, "scripts", "retired-project-paths.json");
const installerPath = resolve(projectRoot, "scripts", "install-windows-nssm.ps1");
const environmentModulePath = resolve(projectRoot, "scripts", "nssm-environment.ps1");
const serviceModulePath = resolve(projectRoot, "scripts", "nssm-service.ps1");
const updateStateModulePath = resolve(projectRoot, "scripts", "nssm-update-state.ps1");
const installerSource = readFileSync(installerPath, "utf8");
const serviceModuleSource = readFileSync(serviceModulePath, "utf8");

function normalizePath(value) {
  return value.trim().replaceAll("\\", "/");
}

function readRetiredProjectPaths() {
  return JSON.parse(readFileSync(manifestPath, "utf8")).map(normalizePath);
}

function readGitLines(args) {
  return execFileSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .map(normalizePath)
    .filter(Boolean);
}

function readCurrentReleasePaths() {
  const deletedPaths = new Set(readGitLines(["ls-files", "--deleted"]));
  return readGitLines(["ls-files"]).filter((path) => !deletedPaths.has(path));
}

describe("Windows NSSM update cleanup", () => {
  it("loads the installer responsibilities from focused helper scripts", () => {
    for (const modulePath of [environmentModulePath, serviceModulePath, updateStateModulePath]) {
      expect(installerSource).toContain(`. (Join-Path $PSScriptRoot "${modulePath.split(/[\\/]/).at(-1)}")`);
    }
  });

  it("uses Windows service controls for start transitions", () => {
    expect(serviceModuleSource).toContain("Start-Service -Name $Name -ErrorAction Stop");
    expect(serviceModuleSource).toContain("Resume-Service -Name $Name -ErrorAction Stop");
    expect(serviceModuleSource).toContain('@("Running", "StartPending")');
    expect(serviceModuleSource).not.toContain('Invoke-NssmCommand -Arguments @($Action, $Name)');
  });

  it("covers every file removed from the repository", () => {
    const retiredPaths = readRetiredProjectPaths();
    const trackedPaths = new Set(readCurrentReleasePaths());
    const deletedPaths = new Set(
      readGitLines(["log", "--all", "--diff-filter=D", "--name-only", "--pretty=format:"]),
    );

    const uncoveredPaths = [...deletedPaths]
      .filter((path) => !trackedPaths.has(path) && !existsSync(resolve(projectRoot, path)))
      .filter(
        (path) =>
          !retiredPaths.some((retiredPath) => path === retiredPath || path.startsWith(`${retiredPath}/`)),
      )
      .sort();

    expect(uncoveredPaths).toEqual([]);
  });

  it("never removes a file tracked by the current release", () => {
    const retiredPaths = readRetiredProjectPaths();
    const trackedPaths = readCurrentReleasePaths();
    const unsafePaths = trackedPaths.filter((trackedPath) =>
      retiredPaths.some(
        (retiredPath) =>
          trackedPath === retiredPath || trackedPath.startsWith(`${retiredPath}/`),
      ),
    );

    expect(unsafePaths).toEqual([]);
  });
});

describe("Windows NSSM worker recovery", () => {
  it("applies automatic restart settings to new and existing services", () => {
    expect(serviceModuleSource).toContain('Set-NssmOption $Name "Start" @("SERVICE_AUTO_START")');
    expect(serviceModuleSource).toContain('Set-NssmOption $Name "AppExit" @("Default", "Restart")');
    expect(serviceModuleSource).toContain('Set-NssmOption $Name "AppRestartDelay" @(5000)');
    expect(installerSource).toMatch(
      /foreach \(\$Name in \$ServiceNames\) \{\s+Set-NssmServiceRecovery -Name \$Name\s+\}/,
    );
  });
});
