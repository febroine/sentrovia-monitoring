import { eq } from "drizzle-orm";
import { parse, stringify } from "yaml";
import { createManyMonitors, listMonitors } from "@/lib/monitors/service";
import { toMonitorPayload } from "@/lib/monitors/targets";
import type { MonitorRecord, WorkspaceBackupBundle } from "@/lib/monitors/types";
import { getSettings, upsertSettings } from "@/lib/settings/service";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import { settingsSchema } from "@/lib/settings/schemas";
import { createCompany, listCompanies } from "@/lib/companies/service";
import { db } from "@/lib/db";
import { companies, logFilterPresets, maintenanceWindows, monitorChecks, monitorEvents, monitorIncidents, monitors } from "@/lib/db/schema";
import { serializeMonitorRecord } from "@/lib/monitors/utils";

export async function buildWorkspaceBackupBundle(userId: string): Promise<WorkspaceBackupBundle> {
  const [settings, companyRows, monitorRows] = await Promise.all([
    getSettings(userId),
    listCompanies(userId),
    listMonitors(userId),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "sentrovia",
    settings: settings ?? DEFAULT_SETTINGS,
    companies: companyRows.map((company) => ({
      name: company.name,
      description: company.description ?? "",
      isActive: company.isActive,
    })),
    monitors: monitorRows.map((monitor) => toMonitorPayload(serializeMonitorRecord(monitor) as MonitorRecord)),
  };
}

export function serializeWorkspaceBackup(bundle: WorkspaceBackupBundle, format: "json" | "yaml") {
  return format === "yaml" ? stringify(bundle) : JSON.stringify(bundle, null, 2);
}

export function parseWorkspaceBackup(raw: string, format: "json" | "yaml") {
  const parsed = format === "yaml" ? parse(raw) : JSON.parse(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("The uploaded backup file is invalid.");
  }

  return parsed as WorkspaceBackupBundle;
}

export async function restoreWorkspaceBackup(userId: string, bundle: WorkspaceBackupBundle) {
  if (!bundle.settings || !Array.isArray(bundle.companies) || !Array.isArray(bundle.monitors)) {
    throw new Error("The backup file does not match the Sentrovia workspace format.");
  }

  await db.transaction(async (tx) => {
    await tx.delete(logFilterPresets).where(eq(logFilterPresets.userId, userId));
    await tx.delete(maintenanceWindows).where(eq(maintenanceWindows.userId, userId));
    await tx.delete(monitorChecks).where(eq(monitorChecks.userId, userId));
    await tx.delete(monitorEvents).where(eq(monitorEvents.userId, userId));
    await tx.delete(monitorIncidents).where(eq(monitorIncidents.userId, userId));
    await tx.delete(monitors).where(eq(monitors.userId, userId));
    await tx.delete(companies).where(eq(companies.userId, userId));
  });

  const settings = settingsSchema.parse(bundle.settings);
  await upsertSettings(userId, {
    ...settings,
    data: {
      ...settings.data,
      lastBackupAt: new Date().toISOString(),
    },
  });

  const restoredCompanies = await Promise.all(
    bundle.companies.map((company) =>
      createCompany(userId, {
        name: company.name,
        description: company.description,
        isActive: company.isActive,
      })
    )
  );

  const companyIdByName = new Map(restoredCompanies.map((company) => [company.name, company.id]));
  const restoredMonitors = bundle.monitors.map((monitor) => ({
    ...monitor,
    companyId: monitor.company ? companyIdByName.get(monitor.company) ?? "" : "",
  }));

  await createManyMonitors(userId, restoredMonitors as Parameters<typeof createManyMonitors>[1]);
  return {
    companies: await listCompanies(userId),
    monitors: await listMonitors(userId),
  };
}
