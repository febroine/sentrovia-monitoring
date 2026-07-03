import { describe, expect, it, vi } from "vitest";
import { GET as getSystemTelemetry } from "@/app/api/system/route";
import { GET as exportBackup } from "@/app/api/system/backup/export/route";
import { POST as restoreBackup } from "@/app/api/system/backup/restore/route";
import { getSession } from "@/lib/auth/session";
import { buildWorkspaceBackupBundle, restoreWorkspaceBackup } from "@/lib/system/backup-service";

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/system/backup-service", () => ({
  buildWorkspaceBackupBundle: vi.fn(),
  serializeWorkspaceBackup: vi.fn(),
  parseWorkspaceBackup: vi.fn(),
  restoreWorkspaceBackup: vi.fn(),
}));

const memberSession = {
  id: "member-1",
  firstName: "Member",
  lastName: "User",
  email: "member@example.com",
  department: null,
  role: "member" as const,
  sessionVersion: 1,
};

describe("system route authorization", () => {
  it("denies system telemetry to non-admin members", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(memberSession);

    const response = await getSystemTelemetry();
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(403);
    expect(body.message).toBe("Admin access required.");
  });

  it("denies backup export to non-admin members", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(memberSession);

    const response = await exportBackup(new Request("https://example.com/api/system/backup/export") as never);
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(403);
    expect(body.message).toBe("Admin access required.");
    expect(buildWorkspaceBackupBundle).not.toHaveBeenCalled();
  });

  it("denies backup restore to non-admin members", async () => {
    vi.mocked(getSession).mockResolvedValueOnce(memberSession);

    const response = await restoreBackup(
      new Request("https://example.com/api/system/backup/restore", {
        method: "POST",
        body: JSON.stringify({ format: "json", content: "{}" }),
      }) as never
    );
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(403);
    expect(body.message).toBe("Admin access required.");
    expect(restoreWorkspaceBackup).not.toHaveBeenCalled();
  });
});
