import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { monitorIncidents, monitors } from "@/lib/db/schema";

async function listIncidents(userId: string, status?: "open" | "resolved") {
  return db
    .select({
      id: monitorIncidents.id,
      monitorId: monitorIncidents.monitorId,
      monitorName: monitors.name,
      monitorType: monitors.monitorType,
      company: monitors.company,
      status: monitorIncidents.status,
      startedAt: monitorIncidents.startedAt,
      resolvedAt: monitorIncidents.resolvedAt,
      lastCheckedAt: monitorIncidents.lastCheckedAt,
      statusCode: monitorIncidents.statusCode,
      errorMessage: monitorIncidents.errorMessage,
      notes: monitorIncidents.notes,
      postmortem: monitorIncidents.postmortem,
    })
    .from(monitorIncidents)
    .innerJoin(monitors, eq(monitors.id, monitorIncidents.monitorId))
    .where(
      and(
        eq(monitorIncidents.userId, userId),
        status ? eq(monitorIncidents.status, status) : undefined
      )
    )
    .orderBy(desc(monitorIncidents.startedAt));
}

export async function getIncidentOverview(userId: string) {
  const [openIncidents, resolvedIncidents] = await Promise.all([
    listIncidents(userId, "open"),
    listIncidents(userId, "resolved"),
  ]);

  return {
    summary: {
      open: openIncidents.length,
      resolved: resolvedIncidents.length,
      total: openIncidents.length + resolvedIncidents.length,
    },
    openIncidents,
    recentResolvedIncidents: resolvedIncidents.slice(0, 5),
  };
}

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
