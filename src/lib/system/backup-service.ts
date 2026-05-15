import { eq } from "drizzle-orm";
import { parse, stringify } from "yaml";
import type { MonitorInput } from "@/lib/monitors/schemas";
import { companyInputSchema } from "@/lib/companies/schemas";
import { createManyMonitors, listMonitors } from "@/lib/monitors/service";
import { monitorInputSchema } from "@/lib/monitors/schemas";
import { toMonitorPayload } from "@/lib/monitors/targets";
import { buildCanonicalMonitorTarget, buildMonitorIdentityKey } from "@/lib/monitors/targets";
import { assertRestorablePostgresMonitorPasswords } from "@/lib/monitors/secret-validation";
import type { MonitorRecord, WorkspaceBackupBundle } from "@/lib/monitors/types";
import { getSettings, upsertSettings } from "@/lib/settings/service";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import { settingsSchema } from "@/lib/settings/schemas";
import { createCompany, listCompanies } from "@/lib/companies/service";
import { db } from "@/lib/db";
import { companies, monitorChecks, monitorEvents, monitorIncidents, monitors } from "@/lib/db/schema";
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
  let parsed: unknown;

  try {
    parsed = format === "yaml" ? parse(raw) : JSON.parse(raw);
  } catch {
    throw new Error("The backup file is invalid.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("The uploaded backup file is invalid.");
  }

  return parsed as WorkspaceBackupBundle;
}

export async function restoreWorkspaceBackup(userId: string, bundle: WorkspaceBackupBundle) {
  if (!bundle.settings || !Array.isArray(bundle.companies) || !Array.isArray(bundle.monitors)) {
    throw new Error("The backup file does not match the Sentrovia workspace format.");
  }

  const validated = validateWorkspaceBackupBundle(bundle);

  await db.transaction(async (tx) => {
    await upsertSettings(userId, {
      ...validated.settings,
      data: {
        ...validated.settings.data,
        lastBackupAt: new Date().toISOString(),
      },
    }, tx, true);

    await tx.delete(monitorChecks).where(eq(monitorChecks.userId, userId));
    await tx.delete(monitorEvents).where(eq(monitorEvents.userId, userId));
    await tx.delete(monitorIncidents).where(eq(monitorIncidents.userId, userId));
    await tx.delete(monitors).where(eq(monitors.userId, userId));
    await tx.delete(companies).where(eq(companies.userId, userId));

    const restoredCompanies = await Promise.all(
      validated.companies.map((company) => createCompany(userId, company, tx))
    );

    const companyIdByName = new Map(restoredCompanies.map((company) => [company.name, company.id]));
    const restoredMonitors = validated.monitors.map((monitor) => ({
      ...monitor,
      companyId: monitor.company ? companyIdByName.get(monitor.company) ?? "" : "",
    }));

    await createManyMonitors(userId, restoredMonitors, tx);
  });

  return {
    companies: await listCompanies(userId),
    monitors: await listMonitors(userId),
  };
}

export function validateWorkspaceBackupBundle(bundle: WorkspaceBackupBundle) {
  const settings = settingsSchema.parse(bundle.settings);
  const companies = companyInputSchema.array().parse(bundle.companies);
  const monitors = monitorInputSchema.array().parse(bundle.monitors);

  assertRestorableSettingsSecrets(settings);
  assertRestorablePostgresMonitorPasswords(monitors);
  assertUniqueCompanyNames(companies);
  assertMonitorCompanyReferences(monitors, companies);
  assertUniqueMonitorTargets(monitors);

  return { settings, companies, monitors };
}

function assertRestorableSettingsSecrets(settings: ReturnType<typeof settingsSchema.parse>) {
  if (
    settings.notifications.smtpPasswordConfigured
    && settings.notifications.smtpPassword.trim().length === 0
  ) {
    throw new Error("SMTP password is not included in workspace backups. Re-enter it before restoring.");
  }
}

function assertUniqueCompanyNames(companies: Array<{ name: string }>) {
  const seenNames = new Set<string>();

  for (const company of companies) {
    const key = company.name.trim().toLowerCase();
    if (seenNames.has(key)) {
      throw new Error(`Duplicate company name in backup: ${company.name}`);
    }

    seenNames.add(key);
  }
}

function assertMonitorCompanyReferences(
  monitors: Array<{ company: string | null }>,
  companies: Array<{ name: string }>
) {
  const companyNames = new Set(companies.map((company) => company.name.trim().toLowerCase()));

  for (const monitor of monitors) {
    if (!monitor.company) {
      continue;
    }

    if (!companyNames.has(monitor.company.trim().toLowerCase())) {
      throw new Error(`Monitor references a missing company: ${monitor.company}`);
    }
  }
}

function assertUniqueMonitorTargets(monitors: MonitorInput[]) {
  const seenTargets = new Set<string>();

  for (const monitor of monitors) {
    const canonicalTarget = buildCanonicalMonitorTarget(monitor);
    const identityKey = buildMonitorIdentityKey({
      monitorType: monitor.monitorType,
      url: canonicalTarget,
    });

    if (seenTargets.has(identityKey)) {
      throw new Error(`Duplicate monitor target in backup: ${monitor.name}`);
    }

    seenTargets.add(identityKey);
  }
}
