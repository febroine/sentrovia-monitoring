import { and, desc, eq, isNull } from "drizzle-orm";
import { AuthError } from "@/lib/auth/errors";
import { db, type DatabaseExecutor } from "@/lib/db";
import { companies, publicStatusPages } from "@/lib/db/schema";
import type { PublicStatusPageInput } from "@/lib/public-status/schemas";
import type { PublicStatusPageRecord } from "@/lib/public-status/types";

type PublicStatusPageRow = typeof publicStatusPages.$inferSelect & {
  companyName: string | null;
  companyDeletedAt: Date | null;
};

export async function listPublicStatusPages(
  userId: string,
  database: DatabaseExecutor = db
): Promise<PublicStatusPageRecord[]> {
  const rows = await database
    .select({
      page: publicStatusPages,
      companyName: companies.name,
      companyDeletedAt: companies.deletedAt,
    })
    .from(publicStatusPages)
    .leftJoin(
      companies,
      and(eq(companies.id, publicStatusPages.companyId), eq(companies.userId, publicStatusPages.userId))
    )
    .where(eq(publicStatusPages.userId, userId))
    .orderBy(desc(publicStatusPages.createdAt));

  return rows.map(({ page, companyName, companyDeletedAt }) =>
    serializePublicStatusPage({ ...page, companyName, companyDeletedAt })
  );
}

export async function createPublicStatusPage(
  userId: string,
  input: PublicStatusPageInput,
  database: DatabaseExecutor = db
) {
  await assertCompanyScopeAvailable(userId, input.companyId, database);

  const [page] = await database
    .insert(publicStatusPages)
    .values({
      userId,
      companyId: input.companyId,
      slug: input.slug,
      title: emptyToNull(input.title),
      summary: emptyToNull(input.summary),
      isEnabled: input.isEnabled,
    })
    .returning();

  return getPublicStatusPageRecord(userId, page.id, database);
}

export async function updatePublicStatusPage(
  userId: string,
  pageId: string,
  input: PublicStatusPageInput,
  database: DatabaseExecutor = db
) {
  await assertCompanyScopeAvailable(userId, input.companyId, database);

  const [page] = await database
    .update(publicStatusPages)
    .set({
      companyId: input.companyId,
      slug: input.slug,
      title: emptyToNull(input.title),
      summary: emptyToNull(input.summary),
      isEnabled: input.isEnabled,
      updatedAt: new Date(),
    })
    .where(and(eq(publicStatusPages.id, pageId), eq(publicStatusPages.userId, userId)))
    .returning({ id: publicStatusPages.id });

  return page ? getPublicStatusPageRecord(userId, page.id, database) : null;
}

export async function deletePublicStatusPage(
  userId: string,
  pageId: string,
  database: DatabaseExecutor = db
) {
  const [deleted] = await database
    .delete(publicStatusPages)
    .where(and(eq(publicStatusPages.id, pageId), eq(publicStatusPages.userId, userId)))
    .returning({ id: publicStatusPages.id, slug: publicStatusPages.slug });

  return deleted ?? null;
}

async function getPublicStatusPageRecord(
  userId: string,
  pageId: string,
  database: DatabaseExecutor
) {
  const [row] = await database
    .select({
      page: publicStatusPages,
      companyName: companies.name,
      companyDeletedAt: companies.deletedAt,
    })
    .from(publicStatusPages)
    .leftJoin(
      companies,
      and(eq(companies.id, publicStatusPages.companyId), eq(companies.userId, publicStatusPages.userId))
    )
    .where(and(eq(publicStatusPages.id, pageId), eq(publicStatusPages.userId, userId)))
    .limit(1);

  return row
    ? serializePublicStatusPage({ ...row.page, companyName: row.companyName, companyDeletedAt: row.companyDeletedAt })
    : null;
}

async function assertCompanyScopeAvailable(
  userId: string,
  companyId: string | null,
  database: DatabaseExecutor
) {
  if (!companyId) {
    return;
  }

  const [company] = await database
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.userId, userId), isNull(companies.deletedAt)))
    .limit(1);

  if (!company) {
    throw new AuthError("The selected public status company is unavailable.", 400);
  }
}

function serializePublicStatusPage(row: PublicStatusPageRow): PublicStatusPageRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.companyName,
    companyAvailable: !row.companyId || Boolean(row.companyName && !row.companyDeletedAt),
    slug: row.slug,
    title: row.title ?? "",
    summary: row.summary ?? "",
    isEnabled: row.isEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function emptyToNull(value: string) {
  return value.length > 0 ? value : null;
}
