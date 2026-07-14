import packageJson from "../../../package.json";

const GITHUB_RELEASE_TIMEOUT_MS = 8_000;
const FALLBACK_RELEASE_TAG = "<release-tag>";
const GITHUB_REPOSITORY_PART_PATTERN = /^[A-Za-z0-9_.-]+$/;
const RELEASE_TAG_PATTERN = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/i;
const BACKUP_REMINDER =
  "Before updating, export or verify a recent backup. The update commands keep .env files and PostgreSQL volumes in place, but backups protect you from operator mistakes and failed migrations.";

type GitHubRelease = {
  tag_name?: string;
  html_url?: string;
  name?: string;
  published_at?: string;
  body?: string;
};

export type UpdateStatus = Awaited<ReturnType<typeof getUpdateStatus>>;

export async function getUpdateStatus() {
  const currentVersion = packageJson.version;
  const repository = resolveRepositorySlug();

  if (!repository) {
    return {
      currentVersion,
      repository: null,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      releaseName: null,
      publishedAt: null,
      notes: null,
      checkedAt: new Date().toISOString(),
      status: "unconfigured" as const,
      message: "Repository metadata is not configured.",
      ...buildUpdateGuidance(null),
    };
  }

  try {
    const release = await fetchLatestGitHubRelease(repository);
    const latestVersion = normalizeVersion(release.tag_name ?? "");
    const targetTag = resolveTargetTag(release.tag_name, latestVersion);

    return {
      currentVersion,
      repository,
      latestVersion,
      updateAvailable: latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false,
      releaseUrl: release.html_url ?? null,
      releaseName: release.name ?? release.tag_name ?? null,
      publishedAt: release.published_at ?? null,
      notes: truncateNotes(release.body ?? ""),
      checkedAt: new Date().toISOString(),
      status: "ok" as const,
      message: latestVersion ? "Latest GitHub release checked." : "Latest release does not include a version tag.",
      ...buildUpdateGuidance(targetTag),
    };
  } catch (error) {
    return {
      currentVersion,
      repository,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      releaseName: null,
      publishedAt: null,
      notes: null,
      checkedAt: new Date().toISOString(),
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to check for updates.",
      ...buildUpdateGuidance(null),
    };
  }
}

function resolveRepositorySlug() {
  const configured = process.env.APP_UPDATE_REPO?.trim();
  if (configured) {
    return parseRepositorySlug(configured);
  }

  const repository = packageJson.repository;
  const url = typeof repository === "string" ? repository : repository?.url;
  return parseRepositorySlug(url ?? "");
}

function parseRepositorySlug(value: string) {
  const normalized = value.trim();
  const directMatch = normalized.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (directMatch) {
    return buildRepositorySlug(directMatch[1], directMatch[2]);
  }

  const urlMatch = normalized.match(/github\.com[:/]([^/\s]+)\/([^#?\s]+?)(?:\.git)?(?:[#?].*)?$/i);
  if (!urlMatch) {
    return null;
  }

  return buildRepositorySlug(urlMatch[1], urlMatch[2]);
}

function buildRepositorySlug(owner: string, repository: string) {
  const normalizedOwner = owner.trim();
  const normalizedRepository = repository.trim().replace(/\.git$/i, "");

  if (
    !GITHUB_REPOSITORY_PART_PATTERN.test(normalizedOwner) ||
    !GITHUB_REPOSITORY_PART_PATTERN.test(normalizedRepository)
  ) {
    return null;
  }

  return `${normalizedOwner}/${normalizedRepository}`;
}

async function fetchLatestGitHubRelease(repository: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_RELEASE_TIMEOUT_MS);
  const [owner, repo] = repository.split("/");
  const releaseUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`;

  try {
    const response = await fetch(releaseUrl, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`GitHub release check failed with HTTP ${response.status}.`);
    }

    return (await response.json()) as GitHubRelease;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeVersion(value: string) {
  const normalized = value.trim().replace(/^v/i, "");
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalized) ? normalized : null;
}

export function compareVersions(left: string, right: string) {
  const leftVersion = parseComparableVersion(left);
  const rightVersion = parseComparableVersion(right);

  for (let index = 0; index < 3; index += 1) {
    const diff = leftVersion.core[index] - rightVersion.core[index];
    if (diff !== 0) {
      return diff;
    }
  }

  return comparePrerelease(leftVersion.prerelease, rightVersion.prerelease);
}

function parseComparableVersion(value: string) {
  const withoutBuild = value.split("+", 1)[0];
  const prereleaseSeparator = withoutBuild.indexOf("-");
  const coreValue = prereleaseSeparator === -1 ? withoutBuild : withoutBuild.slice(0, prereleaseSeparator);
  const prereleaseValue = prereleaseSeparator === -1 ? null : withoutBuild.slice(prereleaseSeparator + 1);
  const core = coreValue.split(".").slice(0, 3).map((part) => Number(part) || 0);
  while (core.length < 3) core.push(0);

  return {
    core,
    prerelease: prereleaseValue ? prereleaseValue.split(".") : null,
  };
}

function comparePrerelease(left: string[] | null, right: string[] | null) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const comparison = comparePrereleasePart(left[index], right[index]);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function comparePrereleasePart(left: string | undefined, right: string | undefined) {
  if (left === undefined) return -1;
  if (right === undefined) return 1;
  if (left === right) return 0;

  const leftNumber = /^\d+$/.test(left) ? Number(left) : null;
  const rightNumber = /^\d+$/.test(right) ? Number(right) : null;
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber;
  if (leftNumber !== null) return -1;
  if (rightNumber !== null) return 1;
  return left.localeCompare(right);
}

function truncateNotes(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 1200 ? `${trimmed.slice(0, 1200).trimEnd()}...` : trimmed || null;
}

function resolveTargetTag(rawTag: string | undefined, latestVersion: string | null) {
  const tag = rawTag?.trim();
  if (tag && RELEASE_TAG_PATTERN.test(tag)) {
    return tag;
  }

  return latestVersion ? `v${latestVersion}` : FALLBACK_RELEASE_TAG;
}

export function buildUpdateGuidance(targetTag: string | null) {
  const tag = targetTag ?? FALLBACK_RELEASE_TAG;
  const dockerCommands = [
    "git fetch --tags origin",
    `git checkout ${tag}`,
    "docker compose up -d --build --wait --wait-timeout 300",
  ];
  const serviceCommands = [
    "git fetch --tags origin",
    `git checkout ${tag}`,
    "UPDATE-SENTROVIA.bat",
  ];

  return {
    recommendedCommands: dockerCommands,
    dockerCommands,
    serviceCommands,
    backupReminder: BACKUP_REMINDER,
    requiresManualAction: true,
  };
}
