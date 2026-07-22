import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/lib/db";
import { monitorOutages } from "@/lib/db/schema";

type OutageStateInput = {
  monitorId: string;
  userId: string;
  checkedAt: Date;
  statusCode: number | null;
};

export async function openOrUpdateOutage(
  input: OutageStateInput & { errorMessage: string | null },
  database: DatabaseExecutor = db
) {
  const [outage] = await database
    .insert(monitorOutages)
    .values({
      monitorId: input.monitorId,
      userId: input.userId,
      status: "open",
      startedAt: input.checkedAt,
      lastCheckedAt: input.checkedAt,
      statusCode: input.statusCode,
      errorMessage: input.errorMessage,
    })
    .onConflictDoUpdate({
      target: [monitorOutages.userId, monitorOutages.monitorId],
      targetWhere: sql`${monitorOutages.status} = 'open' and ${monitorOutages.resolvedAt} is null`,
      setWhere: or(
        isNull(monitorOutages.lastCheckedAt),
        lte(monitorOutages.lastCheckedAt, input.checkedAt)
      ),
      set: {
        lastCheckedAt: input.checkedAt,
        statusCode: input.statusCode,
        errorMessage: input.errorMessage,
        updatedAt: new Date(),
      },
    })
    .returning();

  return outage ?? getOpenOutage(input.userId, input.monitorId, database);
}

export async function resolveOutage(input: OutageStateInput, database: DatabaseExecutor = db) {
  const existing = await getOpenOutage(input.userId, input.monitorId, database);
  if (!existing) {
    return null;
  }

  const [outage] = await database
    .update(monitorOutages)
    .set({
      status: "resolved",
      resolvedAt: input.checkedAt,
      lastCheckedAt: input.checkedAt,
      statusCode: input.statusCode,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(monitorOutages.id, existing.id),
        or(
          isNull(monitorOutages.lastCheckedAt),
          lte(monitorOutages.lastCheckedAt, input.checkedAt)
        )
      )
    )
    .returning();

  return outage;
}

async function getOpenOutage(
  userId: string,
  monitorId: string,
  database: DatabaseExecutor = db
) {
  const [outage] = await database
    .select()
    .from(monitorOutages)
    .where(
      and(
        eq(monitorOutages.userId, userId),
        eq(monitorOutages.monitorId, monitorId),
        eq(monitorOutages.status, "open"),
        isNull(monitorOutages.resolvedAt)
      )
    )
    .orderBy(desc(monitorOutages.startedAt))
    .limit(1);

  return outage ?? null;
}
