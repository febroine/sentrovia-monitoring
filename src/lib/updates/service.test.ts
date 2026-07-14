import { afterEach, describe, expect, it, vi } from "vitest";
import packageJson from "../../../package.json";
import { buildUpdateGuidance, compareVersions, getUpdateStatus } from "@/lib/updates/service";

const originalUpdateRepo = process.env.APP_UPDATE_REPO;

afterEach(() => {
  process.env.APP_UPDATE_REPO = originalUpdateRepo;
  vi.unstubAllGlobals();
});

describe("update service", () => {
  it("detects a newer GitHub release", async () => {
    process.env.APP_UPDATE_REPO = "aykutbyrm/sentrovia-monitoring";
    mockLatestRelease("v0.1.2");

    const status = await getUpdateStatus();

    expect(status.currentVersion).toBe(packageJson.version);
    expect(status.latestVersion).toBe("0.1.2");
    expect(status.updateAvailable).toBe(true);
    expect(status.dockerCommands).toContain("git checkout v0.1.2");
    expect(status.requiresManualAction).toBe(true);
  });

  it("does not mark the current or older release as available", async () => {
    process.env.APP_UPDATE_REPO = "aykutbyrm/sentrovia-monitoring";
    mockLatestRelease(`v${packageJson.version}`);

    const current = await getUpdateStatus();
    mockLatestRelease("v0.1.0");
    const older = await getUpdateStatus();

    expect(current.updateAvailable).toBe(false);
    expect(older.updateAvailable).toBe(false);
  });

  it("normalizes v-prefixed semantic version tags", async () => {
    process.env.APP_UPDATE_REPO = "aykutbyrm/sentrovia-monitoring";
    mockLatestRelease("v1.2.3");

    const status = await getUpdateStatus();

    expect(status.latestVersion).toBe("1.2.3");
  });

  it("orders prerelease versions below the matching stable release", () => {
    expect(compareVersions("1.2.3", "1.2.3-rc.1")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3-rc.2", "1.2.3-rc.1")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3-beta.2", "1.2.3-beta.10")).toBeLessThan(0);
  });

  it("returns unconfigured status when repository metadata cannot be resolved", async () => {
    process.env.APP_UPDATE_REPO = "not a repository";

    const status = await getUpdateStatus();

    expect(status.status).toBe("unconfigured");
    expect(status.repository).toBeNull();
    expect(status.recommendedCommands).toContain("git checkout <release-tag>");
  });

  it("does not place invalid release tags into shell commands", async () => {
    process.env.APP_UPDATE_REPO = "aykutbyrm/sentrovia-monitoring";
    mockLatestRelease("v1.2.3; rm -rf .");

    const status = await getUpdateStatus();

    expect(status.latestVersion).toBeNull();
    expect(status.dockerCommands).toContain("git checkout <release-tag>");
    expect(status.dockerCommands.join("\n")).not.toContain("rm -rf");
  });

  it("rejects unsafe repository metadata", async () => {
    process.env.APP_UPDATE_REPO = "owner/repo;bad";

    const status = await getUpdateStatus();

    expect(status.status).toBe("unconfigured");
    expect(status.repository).toBeNull();
  });

  it("returns error status when the GitHub release check fails", async () => {
    process.env.APP_UPDATE_REPO = "aykutbyrm/sentrovia-monitoring";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 500 })));

    const status = await getUpdateStatus();

    expect(status.status).toBe("error");
    expect(status.message).toContain("HTTP 500");
  });

  it("builds Docker and service update command profiles for a release tag", () => {
    const guidance = buildUpdateGuidance("v2.0.0");

    expect(guidance.recommendedCommands).toEqual(guidance.dockerCommands);
    expect(guidance.dockerCommands).toEqual([
      "git fetch --tags origin",
      "git checkout v2.0.0",
      "docker compose up -d --build --wait --wait-timeout 300",
    ]);
    expect(guidance.serviceCommands).toEqual([
      "git fetch --tags origin",
      "git checkout v2.0.0",
      "UPDATE-SENTROVIA.bat",
    ]);
  });
});

function mockLatestRelease(tagName: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        tag_name: tagName,
        html_url: `https://github.com/aykutbyrm/sentrovia-monitoring/releases/tag/${tagName}`,
        name: `Sentrovia ${tagName}`,
        published_at: "2026-07-08T09:00:00.000Z",
        body: "Release notes",
      })
    )
  );
}
