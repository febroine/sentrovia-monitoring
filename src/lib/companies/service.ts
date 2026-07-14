import { and, desc, eq, inArray } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/lib/db";
import { companies, monitors } from "@/lib/db/schema";
import type { CompanyInput } from "@/lib/companies/schemas";

export async function listCompanies(userId: string) {
  const companyRows = await db
    .select()
    .from(companies)
    .where(eq(companies.userId, userId))
    .orderBy(desc(companies.createdAt));

  const monitorRows = await db
    .select({
      id: monitors.id,
      companyId: monitors.companyId,
      status: monitors.status,
      isActive: monitors.isActive,
    })
    .from(monitors)
    .where(eq(monitors.userId, userId));

  return companyRows.map((company) => {
    const related = monitorRows.filter((monitor) => monitor.companyId === company.id);
    return {
      ...company,
      monitorsCount: related.length,
      activeMonitors: related.filter((monitor) => monitor.isActive && monitor.status === "up").length,
    };
  });
}

export async function createCompany(userId: string, input: CompanyInput, database: DatabaseExecutor = db) {
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

export async function getCompanyById(userId: string, companyId: string, database: DatabaseExecutor = db) {
  const [company] = await database
    .select()
    .from(companies)
    .where(and(eq(companies.userId, userId), eq(companies.id, companyId)));

  return company ?? null;
}

export async function updateCompany(userId: string, companyId: string, input: CompanyInput) {
  const company = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(companies)
      .set({
        name: input.name,
        description: input.description,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(and(eq(companies.userId, userId), eq(companies.id, companyId)))
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
  const company = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.userId, userId), eq(companies.id, companyId)));

    if (!existing) {
      return null;
    }

    await tx
      .update(monitors)
      .set({
        companyId: null,
        company: null,
        updatedAt: new Date(),
      })
      .where(and(eq(monitors.userId, userId), eq(monitors.companyId, companyId)));

    const [deleted] = await tx
      .delete(companies)
      .where(and(eq(companies.userId, userId), eq(companies.id, companyId)))
      .returning({ id: companies.id });

    return deleted ?? null;
  });

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
    .where(and(eq(companies.userId, userId), inArray(companies.id, companyIds)));

  return listCompanies(userId);
}

export async function deleteCompanies(userId: string, ids: string[]) {
  const companyIds = Array.from(new Set(ids));
  if (companyIds.length === 0) {
    return [];
  }

  return db.transaction(async (tx) => {
    await tx
      .update(monitors)
      .set({
        companyId: null,
        company: null,
        updatedAt: new Date(),
      })
      .where(and(eq(monitors.userId, userId), inArray(monitors.companyId, companyIds)));

    const deleted = await tx
      .delete(companies)
      .where(and(eq(companies.userId, userId), inArray(companies.id, companyIds)))
      .returning({ id: companies.id });

    return deleted.map((company) => company.id);
  });
}
