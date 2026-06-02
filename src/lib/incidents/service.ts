import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { incidentEvents, monitorIncidents, monitors } from "@/lib/db/schema";

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
      acknowledgedAt: monitorIncidents.acknowledgedAt,
      acknowledgedBy: monitorIncidents.acknowledgedBy,
      acknowledgementNote: monitorIncidents.acknowledgementNote,
    })
    .from(monitorIncidents)
    .innerJoin(monitors, eq(monitors.id, monitorIncidents.monitorId))
    .where(
      and(
        eq(monitorIncidents.userId, userId),
        eq(monitors.isActive, true),
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
  const timelineMap = await listIncidentTimeline(userId, [
    ...openIncidents.map((incident) => incident.id),
    ...resolvedIncidents.slice(0, 5).map((incident) => incident.id),
  ]);

  return {
    summary: {
      open: openIncidents.length,
      resolved: resolvedIncidents.length,
      total: openIncidents.length + resolvedIncidents.length,
    },
    openIncidents: attachTimeline(openIncidents, timelineMap),
    recentResolvedIncidents: attachTimeline(resolvedIncidents.slice(0, 5), timelineMap),
  };
}

async function listIncidentTimeline(userId: string, incidentIds: string[]) {
  if (incidentIds.length === 0) {
    return new Map<string, IncidentEventRecord[]>();
  }

  const rows = await db
    .select({
      id: incidentEvents.id,
      incidentId: incidentEvents.incidentId,
      eventType: incidentEvents.eventType,
      title: incidentEvents.title,
      detail: incidentEvents.detail,
      createdAt: incidentEvents.createdAt,
    })
    .from(incidentEvents)
    .where(and(eq(incidentEvents.userId, userId), inArray(incidentEvents.incidentId, incidentIds)))
    .orderBy(desc(incidentEvents.createdAt));

  const timelineMap = new Map<string, IncidentEventRecord[]>();
  for (const row of rows) {
    if (!row.incidentId) {
      continue;
    }

    const existing = timelineMap.get(row.incidentId) ?? [];
    if (existing.length < 12) {
      existing.push({ ...row, createdAt: row.createdAt.toISOString() });
      timelineMap.set(row.incidentId, existing);
    }
  }

  return timelineMap;
}

function attachTimeline<T extends { id: string }>(incidents: T[], timelineMap: Map<string, IncidentEventRecord[]>) {
  return incidents.map((incident) => ({
    ...incident,
    timeline: timelineMap.get(incident.id) ?? [],
  }));
}

type IncidentEventRecord = {
  id: string;
  incidentId: string | null;
  eventType: string;
  title: string;
  detail: string | null;
  createdAt: string;
};

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

export async function acknowledgeIncident(input: {
  userId: string;
  incidentId: string;
  acknowledgedBy: string;
  note: string;
}) {
  const acknowledgedAt = new Date();
  const [incident] = await db
    .update(monitorIncidents)
    .set({
      acknowledgedAt,
      acknowledgedBy: input.acknowledgedBy,
      acknowledgementNote: input.note,
      updatedAt: acknowledgedAt,
    })
    .where(
      and(
        eq(monitorIncidents.id, input.incidentId),
        eq(monitorIncidents.userId, input.userId),
        eq(monitorIncidents.status, "open"),
        isNull(monitorIncidents.resolvedAt)
      )
    )
    .returning();

  if (!incident) {
    return null;
  }

  await db.insert(incidentEvents).values({
    incidentId: incident.id,
    monitorId: incident.monitorId,
    userId: input.userId,
    eventType: "incident_acknowledged",
    title: "Incident acknowledged",
    detail: input.note || "An operator acknowledged this incident.",
    metadataJson: JSON.stringify({ acknowledgedBy: input.acknowledgedBy }),
    createdAt: acknowledgedAt,
  });

  return {
    ...incident,
    startedAt: incident.startedAt.toISOString(),
    resolvedAt: incident.resolvedAt?.toISOString() ?? null,
    lastCheckedAt: incident.lastCheckedAt?.toISOString() ?? null,
    acknowledgedAt: incident.acknowledgedAt?.toISOString() ?? null,
    createdAt: incident.createdAt.toISOString(),
    updatedAt: incident.updatedAt.toISOString(),
  };
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
