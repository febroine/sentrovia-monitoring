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

function compareVersions(left: string, right: string) {
  const leftParts = left.split(/[.+-]/).slice(0, 3).map(Number);
  const rightParts = right.split(/[.+-]/).slice(0, 3).map(Number);

  for (let index = 0; index < 3; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
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
    "docker compose up -d --build",
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
