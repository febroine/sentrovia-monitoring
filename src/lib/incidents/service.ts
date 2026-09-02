import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { incidentUpdates, monitorOutages, monitors, users, workspaceMembers } from "@/lib/db/schema";
import type { z } from "zod";
import type { incidentUpdateSchema } from "@/lib/incidents/schemas";

type IncidentUpdateInput = z.infer<typeof incidentUpdateSchema>;

export async function listIncidents(workspaceId: string) {
  const [incidents, members] = await Promise.all([
    db.select({ id: monitorOutages.id, monitorId: monitorOutages.monitorId, monitorName: monitors.name, status: monitorOutages.status, startedAt: monitorOutages.startedAt, acknowledgedAt: monitorOutages.acknowledgedAt, assignedToUserId: monitorOutages.assignedToUserId, escalationLevel: monitorOutages.escalationLevel, errorMessage: monitorOutages.errorMessage }).from(monitorOutages).innerJoin(monitors, eq(monitorOutages.monitorId, monitors.id)).where(and(eq(monitorOutages.workspaceId, workspaceId), isNull(monitorOutages.resolvedAt))).orderBy(desc(monitorOutages.startedAt)),
    db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email }).from(workspaceMembers).innerJoin(users, eq(workspaceMembers.userId, users.id)).where(eq(workspaceMembers.workspaceId, workspaceId)),
  ]);
  return { incidents, members };
}

export async function updateIncident(workspaceId: string, actorUserId: string, incidentId: string, input: IncidentUpdateInput) {
  await assertAssigneeMembership(workspaceId, input.assignedToUserId);
  return db.transaction(async (tx) => {
    const [outage] = await tx.update(monitorOutages).set({ ...(input.acknowledge ? { acknowledgedAt: new Date(), acknowledgedByUserId: actorUserId } : {}), ...(input.assignedToUserId !== undefined ? { assignedToUserId: input.assignedToUserId } : {}), ...(input.escalationLevel !== undefined ? { escalationLevel: input.escalationLevel } : {}), updatedAt: new Date() }).where(and(eq(monitorOutages.id, incidentId), eq(monitorOutages.workspaceId, workspaceId), isNull(monitorOutages.resolvedAt))).returning();
    if (!outage) throw new Error("Active incident was not found.");
    if (input.note) await tx.insert(incidentUpdates).values({ workspaceId, outageId: outage.id, authorUserId: actorUserId, ...input.note });
    return outage;
  });
}

async function assertAssigneeMembership(workspaceId: string, userId: string | null | undefined) {
  if (!userId) return;
  const [member] = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).limit(1);
  if (!member) throw new Error("Assignee must belong to the active workspace.");
}
