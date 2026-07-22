import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/lib/db";
import { companies, monitors, reportSchedules, userSettings } from "@/lib/db/schema";
import type { CompanyInput } from "@/lib/companies/schemas";

export const COMPANY_SOFT_DELETE_UNDO_MS = 60_000;

export async function listCompanies(userId: string, database: DatabaseExecutor = db) {
  const companyRows = await database
    .select()
    .from(companies)
    .where(and(eq(companies.userId, userId), isNull(companies.deletedAt)))
    .orderBy(desc(companies.createdAt));

  const monitorRows = await database
    .select({
      id: monitors.id,
      companyId: monitors.companyId,
      status: monitors.status,
      isActive: monitors.isActive,
    })
    .from(monitors)
    .where(and(eq(monitors.userId, userId), isNull(monitors.deletedAt)));

  return companyRows.map((company) => {
    const related = monitorRows.filter((monitor) => monitor.companyId === company.id);
    return {
      ...company,
      monitorsCount: related.length,
      activeMonitors: related.filter((monitor) => monitor.isActive && monitor.status === "up").length,
    };
  });
}

export async function createCompany(userId: string, input: CompanyInput, database?: DatabaseExecutor) {
  if (!database) {
    return db.transaction((tx) => persistCompany(userId, input, tx));
  }

  return persistCompany(userId, input, database);
}

async function persistCompany(userId: string, input: CompanyInput, database: DatabaseExecutor) {
  await releaseExpiredCompanyName(userId, input.name, database);
  const [company] = await database
    .insert(companies)
    .values({
      userId,
      name: input.name,
      description: input.description,
      isActive: input.isActive,
    })
    .returning();

  return {
    ...company,
    monitorsCount: 0,
    activeMonitors: 0,
  };
}

async function releaseExpiredCompanyName(userId: string, name: string, database: DatabaseExecutor) {
  const cutoff = new Date(Date.now() - COMPANY_SOFT_DELETE_UNDO_MS);
  const expired = await database
    .select({ id: companies.id })
    .from(companies)
    .where(
      and(
        eq(companies.userId, userId),
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
    .where(and(eq(userSettings.userId, userId), inArray(userSettings.publicStatusCompanyId, expiredIds)));
  await database
    .update(monitors)
    .set({ companyId: null, company: null, updatedAt: now })
    .where(and(eq(monitors.userId, userId), inArray(monitors.companyId, expiredIds)));
  await database
    .update(reportSchedules)
    .set({
      companyId: null,
      isActive: false,
      lastStatus: "error",
      lastErrorMessage: "The assigned company was deleted.",
      updatedAt: now,
    })
    .where(and(eq(reportSchedules.userId, userId), inArray(reportSchedules.companyId, expiredIds)));
  await database
    .delete(companies)
    .where(and(eq(companies.userId, userId), inArray(companies.id, expiredIds)));
}

export async function getCompanyById(userId: string, companyId: string, database: DatabaseExecutor = db) {
  const [company] = await database
    .select()
    .from(companies)
    .where(and(eq(companies.userId, userId), eq(companies.id, companyId), isNull(companies.deletedAt)));

  return company ?? null;
}

export async function updateCompany(userId: string, companyId: string, input: CompanyInput) {
  const company = await db.transaction(async (tx) => {
    await releaseExpiredCompanyName(userId, input.name, tx);
    const [updated] = await tx
      .update(companies)
      .set({
        name: input.name,
        description: input.description,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(and(eq(companies.userId, userId), eq(companies.id, companyId), isNull(companies.deletedAt)))
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
      .where(and(eq(monitors.userId, userId), eq(monitors.companyId, companyId)));

    return updated;
  });

  if (!company) {
    return null;
  }

  const [withCounts] = await listCompanies(userId).then((items) => items.filter((item) => item.id === companyId));
  return withCounts ?? null;
}

export async function deleteCompany(userId: string, companyId: string) {
  const now = new Date();
  const [company] = await db
    .update(companies)
    .set({
      deletedAt: now,
      deletedWasActive: sql`${companies.isActive}`,
      isActive: false,
      updatedAt: now,
    })
    .where(and(eq(companies.userId, userId), eq(companies.id, companyId), isNull(companies.deletedAt)))
    .returning({ id: companies.id, deletedAt: companies.deletedAt });

  return company ?? null;
}

export async function updateCompaniesActiveState(userId: string, ids: string[], isActive: boolean) {
  const companyIds = Array.from(new Set(ids));
  if (companyIds.length === 0) {
    return [];
  }

  await db
    .update(companies)
    .set({
      isActive,
      updatedAt: new Date(),
    })
    .where(and(eq(companies.userId, userId), inArray(companies.id, companyIds), isNull(companies.deletedAt)));

  return listCompanies(userId);
}

export async function deleteCompanies(userId: string, ids: string[]) {
  const companyIds = Array.from(new Set(ids));
  if (companyIds.length === 0) {
    return [];
  }

  const now = new Date();
  const deleted = await db
    .update(companies)
    .set({
      deletedAt: now,
      deletedWasActive: sql`${companies.isActive}`,
      isActive: false,
      updatedAt: now,
    })
    .where(and(eq(companies.userId, userId), inArray(companies.id, companyIds), isNull(companies.deletedAt)))
    .returning({ id: companies.id, deletedAt: companies.deletedAt });

  return deleted;
}

export async function restoreCompanies(userId: string, ids: string[], now = new Date()) {
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
        eq(companies.userId, userId),
        inArray(companies.id, ids),
        isNotNull(companies.deletedAt),
        gte(companies.deletedAt, undoCutoff)
      )
    )
    .returning();
}
