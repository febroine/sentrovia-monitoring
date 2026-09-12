import { describe, expect, it } from "vitest";
import {
  buildMonitorExportRows,
  getMonitorExportContentType,
  serializeMonitorExport,
} from "@/lib/monitors/export";

describe("monitor exports", () => {
  it("exports only selected monitors without credential or notification secret fields", () => {
    const monitors = [
      buildMonitor({ id: "monitor-1", name: "Public site" }),
      buildMonitor({ id: "monitor-2", name: "Private API" }),
    ];

    const rows = buildMonitorExportRows(monitors, new Set(["monitor-2"]));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "monitor-2", name: "Private API" });
    expect(rows[0]).not.toHaveProperty("databasePasswordEncrypted");
    expect(rows[0]).not.toHaveProperty("heartbeatToken");
    expect(rows[0]).not.toHaveProperty("telegramBotToken");
    expect(rows[0]).not.toHaveProperty("notifEmail");
    expect(rows[0]).not.toHaveProperty("emailBody");
  });

  it("does not export credentials from legacy HTTP monitor URLs", () => {
    const [row] = buildMonitorExportRows([
      buildMonitor({ url: "https://canary-user:canary-pass@example.com/health?region=eu" }),
    ]);

    expect(row.target).toBe("https://example.com/health?region=eu");
  });

  it("writes UTF-8 CSV and neutralizes spreadsheet formulas", async () => {
    const rows = buildMonitorExportRows([
      buildMonitor({
        name: "=HYPERLINK(\"https://example.com\")",
        company: "Ops, Europe",
      }),
    ]);

    const csv = (await serializeMonitorExport(rows, "csv")).toString("utf8");

    expect(csv.startsWith("\uFEFFID,Name,Type,Target")).toBe(true);
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://example.com\"\")\"");
    expect(csv).toContain("\"Ops, Europe\"");
  });

  it("creates JSON and valid XLSX download payloads", async () => {
    const rows = buildMonitorExportRows([buildMonitor()]);

    const json = JSON.parse((await serializeMonitorExport(rows, "json")).toString("utf8"));
    const xlsx = await serializeMonitorExport(rows, "xlsx");

    expect(json).toEqual(rows);
    expect(xlsx.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(xlsx.byteLength).toBeGreaterThan(1_000);
    expect(getMonitorExportContentType("xlsx")).toContain("spreadsheetml");
  });
});

function buildMonitor(overrides: Record<string, unknown> = {}) {
  return {
    id: "monitor-1",
    name: "API monitor",
    monitorType: "http",
    url: "https://example.com/health",
    company: "Example Inc.",
    status: "up",
    statusCode: 200,
    uptime: "99.95%",
    isActive: true,
    publishOnStatusPage: true,
    isFavorite: false,
    isCritical: true,
    latencyMs: 125,
    intervalValue: 5,
    intervalUnit: "dk",
    timeout: 10_000,
    retries: 3,
    method: "GET",
    tags: ["production", "api"],
    notificationPref: "email",
    sendOutageScreenshot: true,
    lastCheckedAt: new Date("2026-09-11T08:00:00.000Z"),
    lastSuccessAt: new Date("2026-09-11T08:00:00.000Z"),
    lastFailureAt: null,
    sslExpiresAt: new Date("2027-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-11T08:00:00.000Z"),
    databasePasswordEncrypted: "encrypted-secret",
    heartbeatToken: "heartbeat-secret",
    telegramBotToken: "telegram-secret",
    notifEmail: "alerts@example.com",
    emailBody: "private template",
    ...overrides,
  };
}
