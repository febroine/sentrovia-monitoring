import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/lib/db";
import { companies, monitors, reportSchedules, userSettings } from "@/lib/db/schema";
import type { CompanyInput } from "@/lib/companies/schemas";
import { normalizeRecipientScopes, removeMonitorsFromScopes } from "@/lib/companies/recipient-scopes";
import { decryptValueOrLegacyPlaintext, encryptValue } from "@/lib/security/encryption";
import {
  resolveWorkspaceScope,
  type WorkspaceScope,
  type WorkspaceSubject,
} from "@/lib/workspaces/ownership";

export const COMPANY_SOFT_DELETE_UNDO_MS = 60_000;

export async function listCompanies(subject: WorkspaceSubject, database: DatabaseExecutor = db) {
  const scope = await resolveWorkspaceScope(subject, database);
  const companyRows = await database
    .select()
    .from(companies)
    .where(and(eq(companies.workspaceId, scope.workspaceId), isNull(companies.deletedAt)))
    .orderBy(desc(companies.createdAt));

  const monitorRows = await database
    .select({
      id: monitors.id,
      companyId: monitors.companyId,
      status: monitors.status,
      isActive: monitors.isActive,
    })
    .from(monitors)
    .where(and(eq(monitors.workspaceId, scope.workspaceId), isNull(monitors.deletedAt)));

  return companyRows.map((company) => {
    const related = monitorRows.filter((monitor) => monitor.companyId === company.id);
    const counts = summarizeCompanyMonitorCounts(related);
    return {
      ...toCompanyOutput(company),
      monitorsCount: counts.total,
      activeMonitors: counts.active,
    };
  });
}

export function summarizeCompanyMonitorCounts(monitors: Array<{ isActive: boolean }>) {
  return {
    total: monitors.length,
    active: monitors.filter((monitor) => monitor.isActive).length,
  };
}

export async function createCompany(subject: WorkspaceSubject, input: CompanyInput, database?: DatabaseExecutor) {
  if (!database) {
    return db.transaction((tx) => persistCompany(subject, input, tx));
  }

  return persistCompany(subject, input, database);
}

async function persistCompany(subject: WorkspaceSubject, input: CompanyInput, database: DatabaseExecutor) {
  const scope = await resolveWorkspaceScope(subject, database);
  await releaseExpiredCompanyName(scope, input.name, database);
  const telegram = resolveCompanyTelegramCredentials(input, null);
  const [company] = await database
    .insert(companies)
    .values({
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      name: input.name,
      description: input.description,
      notificationEmailRecipients: input.notificationEmailRecipients,
      // A new company has no monitors yet, so every address starts by covering all of them.
      notificationEmailScopes: {},
      telegramBotTokenEncrypted: telegram.botTokenEncrypted,
      telegramChatId: telegram.chatId,
      isActive: input.isActive,
    })
    .returning();

  return {
    ...toCompanyOutput(company),
    monitorsCount: 0,
    activeMonitors: 0,
  };
}

async function releaseExpiredCompanyName(scope: WorkspaceScope, name: string, database: DatabaseExecutor) {
  const cutoff = new Date(Date.now() - COMPANY_SOFT_DELETE_UNDO_MS);
  const expired = await database
    .select({ id: companies.id })
    .from(companies)
    .where(
      and(
        eq(companies.workspaceId, scope.workspaceId),
        lt(companies.deletedAt, cutoff),
        sql`lower(btrim(${companies.name})) = lower(btrim(${name}))`
      )
    );
  const expiredIds = expired.map((company) => company.id);
  if (expiredIds.length === 0) {
    return;
  }

  const now = new Date();
  await database
    .update(userSettings)
    .set({
      publicStatusEnabled: false,
      publicStatusCompanyId: null,
      updatedAt: now,
    })
    .where(and(eq(userSettings.userId, scope.userId), inArray(userSettings.publicStatusCompanyId, expiredIds)));
  await database
    .update(monitors)
    .set({ companyId: null, company: null, updatedAt: now })
    .where(and(eq(monitors.workspaceId, scope.workspaceId), inArray(monitors.companyId, expiredIds)));
  await database
    .update(reportSchedules)
    .set({
      companyId: null,
      isActive: false,
      lastStatus: "failed",
      lastErrorMessage: "The assigned company was deleted.",
      updatedAt: now,
    })
    .where(and(eq(reportSchedules.workspaceId, scope.workspaceId), inArray(reportSchedules.companyId, expiredIds)));
  await database
    .delete(companies)
    .where(and(eq(companies.workspaceId, scope.workspaceId), inArray(companies.id, expiredIds)));
}

export async function getCompanyById(subject: WorkspaceSubject, companyId: string, database: DatabaseExecutor = db) {
  const scope = await resolveWorkspaceScope(subject, database);
  const [company] = await database
    .select()
    .from(companies)
    .where(and(
      eq(companies.workspaceId, scope.workspaceId),
      eq(companies.id, companyId),
      isNull(companies.deletedAt)
    ));

  return company ?? null;
}

export async function updateCompany(subject: WorkspaceSubject, companyId: string, input: CompanyInput) {
  const company = await db.transaction(async (tx) => {
    const scope = await resolveWorkspaceScope(subject, tx);
    await releaseExpiredCompanyName(scope, input.name, tx);
    const existing = await getCompanyById(scope, companyId, tx);
    if (!existing) {
      return null;
    }
    const telegram = resolveCompanyTelegramCredentials(
      input,
      existing.telegramBotTokenEncrypted
    );
    const notificationEmailScopes = await limitScopesToCompanyMonitors(
      input.notificationEmailScopes,
      input.notificationEmailRecipients,
      scope.workspaceId,
      companyId,
      tx
    );

    const [updated] = await tx
      .update(companies)
      .set({
        name: input.name,
        description: input.description,
        notificationEmailRecipients: input.notificationEmailRecipients,
        notificationEmailScopes,
        telegramBotTokenEncrypted: telegram.botTokenEncrypted,
        telegramChatId: telegram.chatId,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(and(
        eq(companies.workspaceId, scope.workspaceId),
        eq(companies.id, companyId),
        isNull(companies.deletedAt)
      ))
      .returning();

    if (!updated) {
      return null;
    }

    await tx
      .update(monitors)
      .set({
        company: updated.name,
        updatedAt: new Date(),
      })
      .where(and(eq(monitors.workspaceId, scope.workspaceId), eq(monitors.companyId, companyId)));

    return updated;
  });

  if (!company) {
    return null;
  }

  const [withCounts] = await listCompanies(subject).then((items) => items.filter((item) => item.id === companyId));
  return withCounts ?? null;
}

export async function deleteCompany(subject: WorkspaceSubject, companyId: string) {
  const scope = await resolveWorkspaceScope(subject);
  const now = new Date();
  const [company] = await db
    .update(companies)
    .set({
      deletedAt: now,
      deletedWasActive: sql`${companies.isActive}`,
      isActive: false,
      updatedAt: now,
    })
    .where(and(
      eq(companies.workspaceId, scope.workspaceId),
      eq(companies.id, companyId),
      isNull(companies.deletedAt)
    ))
    .returning({ id: companies.id, deletedAt: companies.deletedAt });

  return company ?? null;
}

export function resolveCompanyTelegramCredentials(input: CompanyInput, existingEncrypted: string | null) {
  const botTokenEncrypted = input.telegramBotToken
    ? encryptValue(input.telegramBotToken)
    : input.telegramBotTokenConfigured
      ? existingEncrypted
      : null;

  return {
    botTokenEncrypted,
    chatId: botTokenEncrypted ? input.telegramChatId : null,
  };
}

// A scope may only name monitors that belong to the company right now.
async function limitScopesToCompanyMonitors(
  scopes: CompanyInput["notificationEmailScopes"],
  recipients: string[],
  workspaceId: string,
  companyId: string,
  database: DatabaseExecutor
) {
  const normalized = normalizeRecipientScopes(scopes, recipients);
  if (Object.keys(normalized).length === 0) return normalized;

  const companyMonitors = await database
    .select({ id: monitors.id })
    .from(monitors)
    .where(and(
      eq(monitors.workspaceId, workspaceId),
      eq(monitors.companyId, companyId),
      isNull(monitors.deletedAt)
    ));
  const assigned = new Set(companyMonitors.map((monitor) => monitor.id));
  return Object.fromEntries(
    Object.entries(normalized).map(([address, ids]) => [address, ids.filter((id) => assigned.has(id))])
  );
}

// Monitors that move to another company, or to none, leave the address limits of every other company,
// so they are not picked up again if they ever return.
export async function removeMonitorsFromOtherCompanyScopes(
  database: DatabaseExecutor,
  workspaceId: string,
  monitorIds: string[],
  currentCompanyId: string | null
) {
  if (monitorIds.length === 0) return;

  const scoped = await database
    .select({ id: companies.id, scopes: companies.notificationEmailScopes })
    .from(companies)
    .where(and(
      eq(companies.workspaceId, workspaceId),
      sql`${companies.notificationEmailScopes} <> '{}'::jsonb`
    ));
  const moved = new Set(monitorIds);
  for (const company of scoped) {
    if (company.id === currentCompanyId) continue;
    const { scopes, changed } = removeMonitorsFromScopes(company.scopes ?? {}, moved);
    if (changed) {
      await database
        .update(companies)
        .set({ notificationEmailScopes: scopes })
        .where(eq(companies.id, company.id));
    }
  }
}

function toCompanyOutput(company: typeof companies.$inferSelect) {
  const { telegramBotTokenEncrypted, ...safeCompany } = company;
  return {
    ...safeCompany,
    telegramBotToken: "",
    telegramBotTokenConfigured: Boolean(decryptValueOrLegacyPlaintext(telegramBotTokenEncrypted)),
    telegramChatId: company.telegramChatId ?? "",
  };
}

export async function updateCompaniesActiveState(
  subject: WorkspaceSubject,
  ids: string[],
  isActive: boolean
) {
  const companyIds = Array.from(new Set(ids));
  if (companyIds.length === 0) {
    return [];
  }

  const scope = await resolveWorkspaceScope(subject);
  await db
    .update(companies)
    .set({
      isActive,
      updatedAt: new Date(),
    })
    .where(and(
      eq(companies.workspaceId, scope.workspaceId),
      inArray(companies.id, companyIds),
      isNull(companies.deletedAt)
    ));

  return listCompanies(scope);
}

export async function deleteCompanies(subject: WorkspaceSubject, ids: string[]) {
  const companyIds = Array.from(new Set(ids));
  if (companyIds.length === 0) {
    return [];
  }

  const scope = await resolveWorkspaceScope(subject);
  const now = new Date();
  const deleted = await db
    .update(companies)
    .set({
      deletedAt: now,
      deletedWasActive: sql`${companies.isActive}`,
      isActive: false,
      updatedAt: now,
    })
    .where(and(
      eq(companies.workspaceId, scope.workspaceId),
      inArray(companies.id, companyIds),
      isNull(companies.deletedAt)
    ))
    .returning({ id: companies.id, deletedAt: companies.deletedAt });

  return deleted;
}

export async function restoreCompanies(subject: WorkspaceSubject, ids: string[], now = new Date()) {
  const scope = await resolveWorkspaceScope(subject);
  const undoCutoff = new Date(now.getTime() - COMPANY_SOFT_DELETE_UNDO_MS);
  return db
    .update(companies)
    .set({
      deletedAt: null,
      isActive: sql`coalesce(${companies.deletedWasActive}, false)`,
      deletedWasActive: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(companies.workspaceId, scope.workspaceId),
        inArray(companies.id, ids),
        isNotNull(companies.deletedAt),
        gte(companies.deletedAt, undoCutoff)
      )
    )
    .returning();
}
