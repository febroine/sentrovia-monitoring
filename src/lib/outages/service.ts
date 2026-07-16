import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitorOutages } from "@/lib/db/schema";

type OutageStateInput = {
  monitorId: string;
  userId: string;
  checkedAt: Date;
  statusCode: number | null;
};

export async function openOrUpdateOutage(input: OutageStateInput & { errorMessage: string | null }) {
  const existing = await getOpenOutage(input.userId, input.monitorId);

  if (existing) {
    const [outage] = await db
      .update(monitorOutages)
      .set({
        lastCheckedAt: input.checkedAt,
        statusCode: input.statusCode,
        errorMessage: input.errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(monitorOutages.id, existing.id))
      .returning();

    return outage;
  }

  const [outage] = await db
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
    .returning();

  return outage;
}

export async function resolveOutage(input: OutageStateInput) {
  const existing = await getOpenOutage(input.userId, input.monitorId);
  if (!existing) {
    return null;
  }

  const [outage] = await db
    .update(monitorOutages)
    .set({
      status: "resolved",
      resolvedAt: input.checkedAt,
      lastCheckedAt: input.checkedAt,
      statusCode: input.statusCode,
      updatedAt: new Date(),
    })
    .where(eq(monitorOutages.id, existing.id))
    .returning();

  return outage;
}

async function getOpenOutage(userId: string, monitorId: string) {
  const [outage] = await db
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
