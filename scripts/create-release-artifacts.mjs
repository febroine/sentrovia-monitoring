import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const PROJECT_ROOT = process.cwd();
const RELEASE_DIRECTORY = path.join(PROJECT_ROOT, "release");

export function assertReleaseTag(tag, version) {
  const expectedTag = `v${version}`;
  if (tag !== expectedTag) {
    throw new Error(`Release tag ${tag || "(missing)"} must match package version ${expectedTag}.`);
  }
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
    throw new Error("Release tags must use the immutable vMAJOR.MINOR.PATCH format.");
  }
}

export function formatChecksum(hash, filename) {
  return `${hash.toLowerCase()}  ${filename}\n`;
}

export async function createReleaseArtifacts(tag, outputDirectory = RELEASE_DIRECTORY) {
  const packageJson = JSON.parse(await fs.promises.readFile(path.join(PROJECT_ROOT, "package.json"), "utf8"));
  assertReleaseTag(tag, packageJson.version);

  await fs.promises.mkdir(outputDirectory, { recursive: true });
  const archiveName = `sentrovia-monitoring-${tag}.zip`;
  const archivePath = path.join(outputDirectory, archiveName);
  await runGitArchive(tag, archivePath, `sentrovia-monitoring-${tag}/`);

  const hash = await sha256File(archivePath);
  const checksumPath = path.join(outputDirectory, "SHA256SUMS");
  await fs.promises.writeFile(checksumPath, formatChecksum(hash, archiveName), "utf8");
  return { archivePath, checksumPath, hash };
}

async function runGitArchive(tag, archivePath, prefix) {
  await new Promise((resolve, reject) => {
    const child = spawn("git", ["archive", "--format=zip", `--prefix=${prefix}`, `--output=${archivePath}`, tag], {
      cwd: PROJECT_ROOT,
      shell: false,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(`git archive failed with exit code ${code ?? "unknown"}.`)));
  });
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function isMainModule() {
  return Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isMainModule()) {
  const tag = readArgument("--tag") ?? process.env.RELEASE_TAG ?? "";
  createReleaseArtifacts(tag)
    .then(({ archivePath, hash }) => console.log(`Created ${archivePath} (${hash}).`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : "Release artifact creation failed.");
      process.exitCode = 1;
    });
}
