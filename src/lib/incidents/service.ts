import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitorIncidents } from "@/lib/db/schema";

export async function openOrUpdateIncident(input: {
  monitorId: string;
  userId: string;
  checkedAt: Date;
  statusCode: number | null;
  errorMessage: string | null;
}) {
  const existing = await getOpenIncident(input.userId, input.monitorId);

  if (existing) {
    const [incident] = await db
      .update(monitorIncidents)
      .set({
        lastCheckedAt: input.checkedAt,
        statusCode: input.statusCode,
        errorMessage: input.errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(monitorIncidents.id, existing.id))
      .returning();

    return incident;
  }

  const [incident] = await db
    .insert(monitorIncidents)
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

  return incident;
}

export async function resolveIncident(input: {
  monitorId: string;
  userId: string;
  checkedAt: Date;
  statusCode: number | null;
}) {
  const existing = await getOpenIncident(input.userId, input.monitorId);

  if (!existing) {
    return null;
  }

  const [incident] = await db
    .update(monitorIncidents)
    .set({
      status: "resolved",
      resolvedAt: input.checkedAt,
      lastCheckedAt: input.checkedAt,
      statusCode: input.statusCode,
      updatedAt: new Date(),
    })
    .where(eq(monitorIncidents.id, existing.id))
    .returning();

  return incident;
}

async function getOpenIncident(userId: string, monitorId: string) {
  const [incident] = await db
    .select()
    .from(monitorIncidents)
    .where(
      and(
        eq(monitorIncidents.userId, userId),
        eq(monitorIncidents.monitorId, monitorId),
        eq(monitorIncidents.status, "open"),
        isNull(monitorIncidents.resolvedAt)
      )
    )
    .orderBy(desc(monitorIncidents.startedAt))
    .limit(1);

  return incident ?? null;
}
