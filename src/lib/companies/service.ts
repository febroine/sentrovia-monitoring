import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
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
    })
    .from(monitors)
    .where(eq(monitors.userId, userId));

  return companyRows.map((company) => {
    const related = monitorRows.filter((monitor) => monitor.companyId === company.id);
    return {
      ...company,
      monitorsCount: related.length,
      activeMonitors: related.filter((monitor) => monitor.status === "up").length,
    };
  });
}

export async function createCompany(userId: string, input: CompanyInput) {
  const [company] = await db
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

export async function getCompanyById(userId: string, companyId: string) {
  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.userId, userId), eq(companies.id, companyId)));

  return company ?? null;
}

export async function updateCompany(userId: string, companyId: string, input: CompanyInput) {
  const [company] = await db
    .update(companies)
    .set({
      name: input.name,
      description: input.description,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(and(eq(companies.userId, userId), eq(companies.id, companyId)))
    .returning();

  if (!company) {
    return null;
  }

  await db
    .update(monitors)
    .set({
      company: company.name,
      updatedAt: new Date(),
    })
    .where(and(eq(monitors.userId, userId), eq(monitors.companyId, companyId)));

  const [withCounts] = await listCompanies(userId).then((items) => items.filter((item) => item.id === companyId));
  return withCounts ?? null;
}

export async function deleteCompany(userId: string, companyId: string) {
  await db
    .update(monitors)
    .set({
      companyId: null,
      company: null,
      updatedAt: new Date(),
    })
    .where(and(eq(monitors.userId, userId), eq(monitors.companyId, companyId)));

  const [company] = await db
    .delete(companies)
    .where(and(eq(companies.userId, userId), eq(companies.id, companyId)))
    .returning({ id: companies.id });

  return company ?? null;
}

export async function updateCompaniesActiveState(userId: string, ids: string[], isActive: boolean) {
  if (ids.length === 0) {
    return [];
  }

  await Promise.all(
    ids.map((companyId) =>
      db
        .update(companies)
        .set({
          isActive,
          updatedAt: new Date(),
        })
        .where(and(eq(companies.userId, userId), eq(companies.id, companyId)))
    )
  );

  return listCompanies(userId);
}

export async function deleteCompanies(userId: string, ids: string[]) {
  const deleted: string[] = [];

  for (const companyId of ids) {
    const company = await deleteCompany(userId, companyId);
    if (company) {
      deleted.push(company.id);
    }
  }

  return deleted;
}
