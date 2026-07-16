import { and, eq, isNotNull } from "drizzle-orm";
import { parse, stringify } from "yaml";
import { AuthError } from "@/lib/auth/errors";
import type { MonitorInput } from "@/lib/monitors/schemas";
import { companyInputSchema } from "@/lib/companies/schemas";
import { redactMonitorExportSecrets } from "@/lib/monitors/config-service";
import { createManyMonitors, listMonitors } from "@/lib/monitors/service";
import { monitorInputSchema } from "@/lib/monitors/schemas";
import { buildCanonicalMonitorTarget, buildMonitorIdentityKey, toMonitorPayload } from "@/lib/monitors/targets";
import type { MonitorRecord, WorkspaceBackupBundle } from "@/lib/monitors/types";
import { decryptValue } from "@/lib/security/encryption";
import { getSettings, upsertSettings } from "@/lib/settings/service";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import { settingsSchema } from "@/lib/settings/schemas";
import { createCompany, listCompanies } from "@/lib/companies/service";
import { db, type DatabaseExecutor } from "@/lib/db";
import {
  companies,
  monitorChecks,
  monitorEvents,
  monitorOutages,
  monitors,
  reportSchedules,
  userSettings,
} from "@/lib/db/schema";
import { WORKSPACE_BACKUP_IMPORT_LIMITS } from "@/lib/import-limits";
import { serializeMonitorRecord } from "@/lib/monitors/utils";
import { getWorkspaceRestoreRevision } from "@/lib/system/restore-approval";

type ExistingPostgresMonitorSecret = {
  monitorType: string;
  url: string;
  databasePasswordEncrypted: string | null;
};

export async function buildWorkspaceBackupBundle(userId: string): Promise<WorkspaceBackupBundle> {
  const [settings, companyRows, monitorRows] = await Promise.all([
    getSettings(userId),
    listCompanies(userId),
    listMonitors(userId),
  ]);

  const exportedAt = new Date().toISOString();
  const resolvedSettings = settings ?? DEFAULT_SETTINGS;

  return {
    version: 1,
    exportedAt,
    source: "sentrovia",
    settings: {
      ...resolvedSettings,
      data: {
        ...resolvedSettings.data,
        lastBackupAt: exportedAt,
      },
    },
    companies: companyRows.map((company) => ({
      name: company.name,
      description: company.description ?? "",
      isActive: company.isActive,
    })),
    monitors: monitorRows.map((monitor) => redactMonitorExportSecrets(toMonitorPayload(serializeMonitorRecord(monitor) as MonitorRecord))),
  };
}

export function serializeWorkspaceBackup(bundle: WorkspaceBackupBundle, format: "json" | "yaml") {
  return format === "yaml" ? stringify(bundle) : JSON.stringify(bundle, null, 2);
}

export async function recordWorkspaceBackupExport(userId: string, exportedAt: string) {
  const timestamp = new Date(exportedAt);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("The workspace backup timestamp is invalid.");
  }

  const updatedAt = new Date();
  await db
    .insert(userSettings)
    .values({ userId, lastBackupAt: timestamp, updatedAt })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { lastBackupAt: timestamp, updatedAt },
    });
}

export function parseWorkspaceBackup(raw: string, format: "json" | "yaml") {
  assertWorkspaceBackupSize(raw);
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

export async function restoreWorkspaceBackup(
  userId: string,
  bundle: WorkspaceBackupBundle,
  options: { expectedRevision?: string } = {}
) {
  if (!bundle.settings || !Array.isArray(bundle.companies) || !Array.isArray(bundle.monitors)) {
    throw new Error("The backup file does not match the Sentrovia workspace format.");
  }

  const validated = validateWorkspaceBackupBundle(bundle);

  await db.transaction(async (tx) => {
    if (options.expectedRevision) {
      const currentRevision = await getWorkspaceRestoreRevision(userId, tx);
      if (currentRevision !== options.expectedRevision) {
        throw new AuthError(
          "Workspace data changed after the restore analysis. Analyze the backup again.",
          409
        );
      }
    }

    const existingMonitorSecrets = await listExistingPostgresMonitorSecrets(userId, tx);
    const restorableMonitors = restorePostgresMonitorPasswords(
      validated.monitors,
      existingMonitorSecrets
    );
    const scheduleCompanyMappings = await tx
      .select({ scheduleId: reportSchedules.id, companyName: companies.name })
      .from(reportSchedules)
      .innerJoin(companies, eq(reportSchedules.companyId, companies.id))
      .where(eq(reportSchedules.userId, userId));

    await upsertSettings(userId, validated.settings, tx, true);

    await tx.delete(monitorChecks).where(eq(monitorChecks.userId, userId));
    await tx.delete(monitorEvents).where(eq(monitorEvents.userId, userId));
    await tx.delete(monitorOutages).where(eq(monitorOutages.userId, userId));
    await tx.delete(monitors).where(eq(monitors.userId, userId));
    await tx.delete(companies).where(eq(companies.userId, userId));

    const restoredCompanies = await Promise.all(
      validated.companies.map((company) => createCompany(userId, company, tx))
    );

    const companyIdByName = buildCompanyIdByName(restoredCompanies);
    await remapReportScheduleCompanies(userId, scheduleCompanyMappings, companyIdByName, tx);
    const restoredMonitors = restorableMonitors.map((monitor) => ({
      ...monitor,
      companyId: resolveRestoredCompanyId(monitor.company, companyIdByName),
    }));

    await createManyMonitors(userId, restoredMonitors, tx);
  }, { isolationLevel: "serializable" });

  return {
    companies: await listCompanies(userId),
    monitors: await listMonitors(userId),
  };
}

export function validateWorkspaceBackupBundle(bundle: WorkspaceBackupBundle) {
  const settings = settingsSchema.parse(bundle.settings);
  const companies = companyInputSchema.array().parse(bundle.companies);
  const monitors = monitorInputSchema.array().parse(bundle.monitors);

  assertBackupItemCounts(companies.length, monitors.length);
  assertUniqueCompanyNames(companies);
  assertMonitorCompanyReferences(monitors, companies);
  assertUniqueMonitorTargets(monitors);

  return { settings, companies, monitors };
}

export function restorePostgresMonitorPasswords(
  incomingMonitors: MonitorInput[],
  existingMonitors: ExistingPostgresMonitorSecret[]
) {
  const passwordsByTarget = new Map<string, string>();

  for (const monitor of existingMonitors) {
    if (monitor.monitorType !== "postgres" || !monitor.databasePasswordEncrypted) {
      continue;
    }

    const password = decryptValue(monitor.databasePasswordEncrypted);
    if (password) {
      passwordsByTarget.set(
        buildMonitorIdentityKey({ monitorType: "postgres", url: monitor.url }),
        password
      );
    }
  }

  return incomingMonitors.map((monitor) => {
    if (
      monitor.monitorType !== "postgres"
      || monitor.databasePassword.trim().length > 0
      || !monitor.databasePasswordConfigured
    ) {
      return monitor;
    }

    const target = buildCanonicalMonitorTarget(monitor);
    const password = passwordsByTarget.get(
      buildMonitorIdentityKey({ monitorType: "postgres", url: target })
    );
    if (!password) {
      throw new Error(
        `PostgreSQL monitor passwords are not included in backups. Re-enter the password before restoring: ${monitor.name}`
      );
    }

    return { ...monitor, databasePassword: password };
  });
}

async function listExistingPostgresMonitorSecrets(
  userId: string,
  database: DatabaseExecutor
) {
  return database
    .select({
      monitorType: monitors.monitorType,
      url: monitors.url,
      databasePasswordEncrypted: monitors.databasePasswordEncrypted,
    })
    .from(monitors)
    .where(and(eq(monitors.userId, userId), eq(monitors.monitorType, "postgres")));
}

export async function previewWorkspaceBackupRestore(userId: string, bundle: WorkspaceBackupBundle) {
  const validated = validateWorkspaceBackupBundle(bundle);
  return db.transaction(async (tx) => {
    const [
      currentCompanies,
      currentMonitors,
      existingMonitorSecrets,
      scheduleCompanyMappings,
      workspaceRevision,
    ] = await Promise.all([
      listCompanies(userId, tx),
      listMonitors(userId, tx),
      listExistingPostgresMonitorSecrets(userId, tx),
      tx
        .select({ companyName: companies.name })
        .from(reportSchedules)
        .innerJoin(companies, eq(reportSchedules.companyId, companies.id))
        .where(and(
          eq(reportSchedules.userId, userId),
          isNotNull(reportSchedules.companyId)
        )),
      getWorkspaceRestoreRevision(userId, tx),
    ]);

    restorePostgresMonitorPasswords(validated.monitors, existingMonitorSecrets);
    return {
      preview: buildWorkspaceRestorePreview(
        validated,
        currentCompanies,
        currentMonitors,
        scheduleCompanyMappings
      ),
      workspaceRevision,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export function buildWorkspaceRestorePreview(
  validated: ReturnType<typeof validateWorkspaceBackupBundle>,
  currentCompanies: Array<{ name: string }>,
  currentMonitors: Array<{ name: string; monitorType: string; url: string }>,
  scheduleCompanyMappings: Array<{ companyName: string }> = []
) {
  const incomingCompanyNames = new Set(
    validated.companies.map((company) => normalizeCompanyName(company.name))
  );
  return {
    current: {
      companies: currentCompanies.length,
      monitors: currentMonitors.length,
    },
    incoming: {
      companies: validated.companies.length,
      monitors: validated.monitors.length,
    },
    settingsWillBeReplaced: true,
    operationalHistoryWillBeDeleted: true,
    removedCompanies: currentCompanies
      .filter((company) => !validated.companies.some((incoming) => normalizeCompanyName(incoming.name) === normalizeCompanyName(company.name)))
      .map((company) => company.name),
    removedMonitors: currentMonitors
      .filter((monitor) => !validated.monitors.some((incoming) => (
        buildMonitorIdentityKey({ monitorType: incoming.monitorType, url: buildCanonicalMonitorTarget(incoming) })
        === buildMonitorIdentityKey({ monitorType: monitor.monitorType as MonitorInput["monitorType"], url: monitor.url })
      )))
      .map((monitor) => monitor.name),
    reportSchedules: {
      remapped: scheduleCompanyMappings.filter((schedule) => (
        incomingCompanyNames.has(normalizeCompanyName(schedule.companyName))
      )).length,
      disabled: scheduleCompanyMappings.filter((schedule) => (
        !incomingCompanyNames.has(normalizeCompanyName(schedule.companyName))
      )).length,
    },
  };
}

async function remapReportScheduleCompanies(
  userId: string,
  mappings: Array<{ scheduleId: string; companyName: string }>,
  companyIdByName: Map<string, string>,
  database: DatabaseExecutor
) {
  for (const mapping of mappings) {
    const companyId = companyIdByName.get(normalizeCompanyName(mapping.companyName));
    await database
      .update(reportSchedules)
      .set(companyId
        ? { companyId, updatedAt: new Date() }
        : {
            companyId: null,
            isActive: false,
            lastStatus: "error",
            lastErrorMessage: "The assigned company was not included in the restored backup.",
            updatedAt: new Date(),
          })
      .where(and(eq(reportSchedules.userId, userId), eq(reportSchedules.id, mapping.scheduleId)));
  }
}

function assertWorkspaceBackupSize(raw: string) {
  if (Buffer.byteLength(raw, "utf8") > WORKSPACE_BACKUP_IMPORT_LIMITS.maxBytes) {
    throw new Error("The uploaded backup file is too large.");
  }
}

function assertBackupItemCounts(companyCount: number, monitorCount: number) {
  if (companyCount > WORKSPACE_BACKUP_IMPORT_LIMITS.maxCompanies) {
    throw new Error(`Restore at most ${WORKSPACE_BACKUP_IMPORT_LIMITS.maxCompanies} companies at a time.`);
  }

  if (monitorCount > WORKSPACE_BACKUP_IMPORT_LIMITS.maxMonitors) {
    throw new Error(`Restore at most ${WORKSPACE_BACKUP_IMPORT_LIMITS.maxMonitors} monitors at a time.`);
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

export function buildCompanyIdByName(companies: Array<{ id: string; name: string }>) {
  return new Map(companies.map((company) => [normalizeCompanyName(company.name), company.id]));
}

export function resolveRestoredCompanyId(companyName: string | null, companyIdByName: Map<string, string>) {
  if (!companyName) {
    return "";
  }

  return companyIdByName.get(normalizeCompanyName(companyName)) ?? "";
}

function normalizeCompanyName(name: string) {
  return name.trim().toLowerCase();
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
