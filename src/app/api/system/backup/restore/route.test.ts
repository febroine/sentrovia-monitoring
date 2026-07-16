import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/system/backup/restore/route";
import { requireAdminSession } from "@/lib/auth/authorization";
import { AuthError } from "@/lib/auth/errors";
import {
  parseWorkspaceBackup,
  previewWorkspaceBackupRestore,
  restoreWorkspaceBackup,
} from "@/lib/system/backup-service";
import {
  createWorkspaceRestoreToken,
  getWorkspaceRestoreRevision,
  verifyWorkspaceRestoreToken,
} from "@/lib/system/restore-approval";

vi.mock("@/lib/auth/authorization", () => ({ requireAdminSession: vi.fn() }));
vi.mock("@/lib/system/backup-service", () => ({
  parseWorkspaceBackup: vi.fn(),
  previewWorkspaceBackupRestore: vi.fn(),
  restoreWorkspaceBackup: vi.fn(),
}));
vi.mock("@/lib/system/restore-approval", () => ({
  createWorkspaceRestoreToken: vi.fn(),
  getWorkspaceRestoreRevision: vi.fn(),
  verifyWorkspaceRestoreToken: vi.fn(),
}));

describe("workspace backup restore route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminSession).mockResolvedValue({ id: "admin-1" } as never);
    vi.mocked(parseWorkspaceBackup).mockReturnValue({ source: "sentrovia" } as never);
    vi.mocked(previewWorkspaceBackupRestore).mockResolvedValue({
      preview: { incoming: { monitors: 1 } },
      workspaceRevision: "workspace-revision",
    } as never);
    vi.mocked(createWorkspaceRestoreToken).mockReturnValue("signed-preview-token");
    vi.mocked(getWorkspaceRestoreRevision).mockResolvedValue("workspace-revision");
    vi.mocked(restoreWorkspaceBackup).mockResolvedValue({ monitors: [], companies: [] } as never);
  });

  it("returns a signed token with the dry-run result", async () => {
    const response = await POST(createRequest({ mode: "preview" }));
    const body = (await response.json()) as { restoreToken: string };

    expect(response.status).toBe(200);
    expect(body.restoreToken).toBe("signed-preview-token");
    expect(createWorkspaceRestoreToken).toHaveBeenCalledWith(
      "admin-1",
      "json",
      "{\"source\":\"sentrovia\"}",
      "workspace-revision"
    );
    expect(restoreWorkspaceBackup).not.toHaveBeenCalled();
  });

  it("rejects restore when preview approval is missing", async () => {
    const response = await POST(createRequest({ mode: "restore", confirm: true }));

    expect(response.status).toBe(400);
    expect(restoreWorkspaceBackup).not.toHaveBeenCalled();
  });

  it("restores only when the signed token matches the exact content", async () => {
    vi.mocked(verifyWorkspaceRestoreToken).mockReturnValueOnce(true);

    const response = await POST(createRequest({
      mode: "restore",
      confirm: true,
      restoreToken: "signed-preview-token",
    }));

    expect(response.status).toBe(200);
    expect(verifyWorkspaceRestoreToken).toHaveBeenCalledWith(
      "signed-preview-token",
      "admin-1",
      "json",
      "{\"source\":\"sentrovia\"}",
      "workspace-revision"
    );
    expect(restoreWorkspaceBackup).toHaveBeenCalledWith(
      "admin-1",
      { source: "sentrovia" },
      { expectedRevision: "workspace-revision" }
    );
  });

  it("returns a conflict when workspace data changes during restore", async () => {
    vi.mocked(verifyWorkspaceRestoreToken).mockReturnValueOnce(true);
    vi.mocked(restoreWorkspaceBackup).mockRejectedValueOnce(
      new AuthError("Workspace data changed after the restore analysis.", 409)
    );

    const response = await POST(createRequest({
      mode: "restore",
      confirm: true,
      restoreToken: "signed-preview-token",
    }));

    expect(response.status).toBe(409);
  });
});

function createRequest(overrides: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/system/backup/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      format: "json",
      content: "{\"source\":\"sentrovia\"}",
      ...overrides,
    }),
  });
}
