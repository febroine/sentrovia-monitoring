import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMonitorForTest } from "@/lib/monitors/service";
import { monitorInputSchema } from "@/lib/monitors/schemas";
import { DEFAULT_MONITOR_FORM } from "@/lib/monitors/types";
import { decryptValue, encryptValue } from "@/lib/security/encryption";

const state = vi.hoisted(() => ({ monitor: {} as Record<string, unknown> }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ where: async () => [state.monitor] }) }) } }));
vi.mock("@/lib/security/network-policy", () => ({ canUserAccessPrivateTargets: async () => false }));
vi.mock("@/lib/security/public-network-target", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/security/public-network-target")>(),
  assertMonitorNetworkTarget: async () => undefined,
}));

const input = () => monitorInputSchema.parse({
  ...DEFAULT_MONITOR_FORM,
  name: "Database",
  monitorType: "postgres",
  databaseHost: "db.example.com",
  databasePort: 5432,
  databaseName: "production",
  databaseUsername: "monitor",
  databasePassword: "",
  databasePasswordConfigured: true,
  databaseSsl: true,
  databaseTlsVerify: true,
  notificationPref: "none",
});

describe("saved database credential destination", () => {
  beforeEach(() => {
    state.monitor = {
      id: "monitor-1", workspaceId: "workspace-1", userId: "admin-1",
      monitorType: "postgres", url: "postgres://monitor@db.example.com:5432/production",
      databaseSsl: true, databaseTlsVerify: true,
      databasePasswordEncrypted: encryptValue("original-secret"),
    };
  });

  it.each([
    { databaseHost: "attacker.example.com" },
    { databasePort: 6543 },
    { databaseUsername: "attacker" },
    { databaseName: "different" },
    { databaseSsl: false },
    { databaseTlsVerify: false },
  ])("rejects retained credentials after connection changes: %j", async (changes) => {
    await expect(buildMonitorForTest("operator-1", { ...input(), ...changes }, "monitor-1", "workspace-1"))
      .rejects.toThrow(/re-enter.*password/i);
  });

  it("retains the password for ordinary edits to the original connection", async () => {
    const monitor = await buildMonitorForTest("operator-1", { ...input(), name: "Renamed", timeout: 8000 }, "monitor-1", "workspace-1");
    expect(decryptValue(monitor.databasePasswordEncrypted)).toBe("original-secret");
  });

  it("retains the password for an equivalent normalized hostname", async () => {
    const monitor = await buildMonitorForTest("operator-1", {
      ...input(), databaseHost: "DB.EXAMPLE.COM",
    }, "monitor-1", "workspace-1");
    expect(decryptValue(monitor.databasePasswordEncrypted)).toBe("original-secret");
  });

  it("allows a new destination with an explicitly supplied replacement password", async () => {
    const monitor = await buildMonitorForTest("operator-1", {
      ...input(), databaseHost: "new.example.com", databasePassword: "replacement-secret",
    }, "monitor-1", "workspace-1");
    expect(decryptValue(monitor.databasePasswordEncrypted)).toBe("replacement-secret");
  });
});
