import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");
const manifestPath = resolve(projectRoot, "scripts", "retired-project-paths.json");

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

describe("Windows NSSM update cleanup", () => {
  it("covers every file removed from the repository", () => {
    const retiredPaths = readRetiredProjectPaths();
    const trackedPaths = new Set(readGitLines(["ls-files"]));
    const deletedPaths = new Set(
      readGitLines(["log", "--all", "--diff-filter=D", "--name-only", "--pretty=format:"]),
    );

    const uncoveredPaths = [...deletedPaths]
      .filter((path) => !trackedPaths.has(path))
      .filter(
        (path) =>
          !retiredPaths.some((retiredPath) => path === retiredPath || path.startsWith(`${retiredPath}/`)),
      )
      .sort();

    expect(uncoveredPaths).toEqual([]);
  });

  it("never removes a file tracked by the current release", () => {
    const retiredPaths = readRetiredProjectPaths();
    const trackedPaths = readGitLines(["ls-files"]);
    const unsafePaths = trackedPaths.filter((trackedPath) =>
      retiredPaths.some(
        (retiredPath) =>
          trackedPath === retiredPath || trackedPath.startsWith(`${retiredPath}/`),
      ),
    );

    expect(unsafePaths).toEqual([]);
  });
});
