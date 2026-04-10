import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PACKAGE_JSON_PATH = path.join(process.cwd(), "package.json");
const GIT_CANDIDATES =
  process.platform === "win32"
    ? ["git", "C:\\Program Files\\Git\\cmd\\git.exe", "C:\\Program Files\\Git\\bin\\git.exe"]
    : ["git", "/usr/bin/git", "/usr/local/bin/git"];

type PackageManifest = {
  version?: string;
};

export type UpdateStatus = {
  enabled: boolean;
  repo: string | null;
  branch: string;
  currentVersion: string;
  remoteVersion: string | null;
  updateAvailable: boolean;
  canAutoApply: boolean;
  message: string;
  releaseUrl: string | null;
};

export async function getUpdateStatus(): Promise<UpdateStatus> {
  const repo = process.env.APP_UPDATE_REPO?.trim() || null;
  const branch = process.env.APP_UPDATE_BRANCH?.trim() || "main";
  const currentVersion = await readCurrentVersion();

  if (!repo) {
    return {
      enabled: false,
      repo: null,
      branch,
      currentVersion,
      remoteVersion: null,
      updateAvailable: false,
      canAutoApply: false,
      message: "Update checks are disabled until APP_UPDATE_REPO is configured.",
      releaseUrl: null,
    };
  }

  const remoteManifest = await readRemoteManifest(repo, branch);
  const remoteVersion = remoteManifest?.version ?? null;
  const updateAvailable = remoteVersion ? compareVersions(remoteVersion, currentVersion) > 0 : false;
  const canAutoApply = await supportsInPlaceUpdate();

  return {
    enabled: true,
    repo,
    branch,
    currentVersion,
    remoteVersion,
    updateAvailable,
    canAutoApply,
    message: buildStatusMessage(updateAvailable, canAutoApply, remoteVersion),
    releaseUrl: `https://github.com/${repo}`,
  };
}

export async function applyAvailableUpdate() {
  const status = await getUpdateStatus();

  if (!status.enabled) {
    throw new Error("Update checks are not configured for this deployment.");
  }

  if (!status.updateAvailable) {
    return {
      updated: false,
      restartRequired: false,
      message: "This instance is already on the latest configured version.",
    };
  }

  const gitExecutable = await resolveGitExecutable();
  if (!gitExecutable || !(await pathExists(path.join(process.cwd(), ".git")))) {
    throw new Error("Automatic update is unavailable here. This runtime is not a writable git checkout.");
  }

  const workingTree = await execFileAsync(gitExecutable, ["status", "--porcelain"], { cwd: process.cwd() });
  if (workingTree.stdout.trim().length > 0) {
    throw new Error("Automatic update is blocked because the working tree has local changes.");
  }

  await execFileAsync(gitExecutable, ["fetch", "origin", status.branch], { cwd: process.cwd() });
  await execFileAsync(gitExecutable, ["pull", "--ff-only", "origin", status.branch], { cwd: process.cwd() });

  return {
    updated: true,
    restartRequired: true,
    message: "Latest changes were pulled successfully. Restart the app to load the new build.",
  };
}

async function readCurrentVersion() {
  const manifest = await readLocalManifest();
  return manifest.version?.trim() || "0.0.0";
}

async function readLocalManifest() {
  const content = await readFile(PACKAGE_JSON_PATH, "utf8");
  return JSON.parse(content) as PackageManifest;
}

async function readRemoteManifest(repo: string, branch: string) {
  const response = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/package.json`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as PackageManifest;
}

async function supportsInPlaceUpdate() {
  if (process.env.ENABLE_IN_PLACE_UPDATES?.trim() === "false") {
    return false;
  }

  const gitExecutable = await resolveGitExecutable();
  return Boolean(gitExecutable && (await pathExists(path.join(process.cwd(), ".git"))));
}

async function resolveGitExecutable() {
  for (const candidate of GIT_CANDIDATES) {
    try {
      await execFileAsync(candidate, ["--version"], { cwd: process.cwd() });
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

async function pathExists(target: string) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function compareVersions(left: string, right: string) {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue === rightValue) {
      continue;
    }

    return leftValue > rightValue ? 1 : -1;
  }

  return 0;
}

function normalizeVersion(value: string) {
  return value
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number(part.replace(/\D+/g, "")) || 0);
}

function buildStatusMessage(updateAvailable: boolean, canAutoApply: boolean, remoteVersion: string | null) {
  if (!remoteVersion) {
    return "The configured repository does not expose a readable package.json yet.";
  }

  if (!updateAvailable) {
    return "This workspace is already on the latest published version.";
  }

  if (canAutoApply) {
    return `Version ${remoteVersion} is available and can be pulled into this checkout.`;
  }

  return `Version ${remoteVersion} is available. This deployment can detect it, but the host must be updated manually.`;
}
