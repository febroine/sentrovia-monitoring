import { readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const manifestPath = path.join(scriptDirectory, "retired-project-paths.json");
const sourceOnly = process.argv.includes("--source-only");

function resolveProjectPath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    throw new Error("Retired project paths must be non-empty strings.");
  }

  const targetPath = path.resolve(projectRoot, relativePath);
  const pathFromRoot = path.relative(projectRoot, targetPath);
  if (pathFromRoot.startsWith("..") || path.isAbsolute(pathFromRoot)) {
    throw new Error(`Refusing to remove a path outside the project directory: ${relativePath}`);
  }

  return targetPath;
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function main() {
  const retiredPaths = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(retiredPaths)) {
    throw new Error("Retired project paths manifest must contain an array.");
  }

  const cleanupPaths = sourceOnly
    ? retiredPaths.filter((relativePath) => relativePath.startsWith("src/"))
    : retiredPaths;

  for (const relativePath of cleanupPaths) {
    const targetPath = resolveProjectPath(relativePath);
    if (!(await pathExists(targetPath))) {
      continue;
    }

    await rm(targetPath, { recursive: true, force: true });
    console.log(`Removed retired project path: ${relativePath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unable to clean retired project files.");
  process.exitCode = 1;
});
