import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/lib/db";
import {
  monitorChecks,
  monitorDiagnostics,
  monitorEvents,
  outageEvents,
  workerState,
} from "@/lib/db/schema";
import type { MonitorDiagnosticResult } from "@/lib/diagnostics/types";
import { WORKER_STATE_ID } from "@/lib/worker/constants";
import { requireWorkspaceIdForUser } from "@/lib/workspaces/ownership";

export async function appendMonitorEvent(input: {
  monitorId: string;
  workspaceId?: string;
  userId: string;
  eventType: string;
  status?: string | null;
  statusCode?: number | null;
  latencyMs?: number | null;
  message?: string | null;
  rcaType?: string | null;
  rcaTitle?: string | null;
  rcaSummary?: string | null;
}, database: DatabaseExecutor = db) {
  const workspaceId = input.workspaceId ?? await requireWorkspaceIdForUser(input.userId, database);
  await database.insert(monitorEvents).values({
    workspaceId,
    monitorId: input.monitorId,
    userId: input.userId,
    eventType: input.eventType,
    status: input.status ?? null,
    statusCode: input.statusCode ?? null,
    latencyMs: input.latencyMs ?? null,
    message: input.message ?? null,
    rcaType: input.rcaType ?? null,
    rcaTitle: input.rcaTitle ?? null,
    rcaSummary: input.rcaSummary ?? null,
  });
}

export async function hasRecentMonitorEvent(input: {
  monitorId: string;
  eventType: string;
  since: Date;
  before: Date;
}) {
  const [event] = await db
    .select({ id: monitorEvents.id })
    .from(monitorEvents)
    .where(
      and(
        eq(monitorEvents.monitorId, input.monitorId),
        eq(monitorEvents.eventType, input.eventType),
        gte(monitorEvents.createdAt, input.since),
        lte(monitorEvents.createdAt, input.before)
      )
    )
    .orderBy(desc(monitorEvents.createdAt))
    .limit(1);

  return Boolean(event);
}

export async function getRecentMonitorEventMessage(input: {
  monitorId: string;
  eventType: string;
  since: Date;
  before: Date;
}) {
  const [event] = await db
    .select({ message: monitorEvents.message })
    .from(monitorEvents)
    .where(
      and(
        eq(monitorEvents.monitorId, input.monitorId),
        eq(monitorEvents.eventType, input.eventType),
        gte(monitorEvents.createdAt, input.since),
        lte(monitorEvents.createdAt, input.before)
      )
    )
    .orderBy(desc(monitorEvents.createdAt))
    .limit(1);

  return event?.message ?? null;
}

export async function countMonitorEvents(input: {
  monitorId: string;
  eventType: string;
  since: Date;
  before: Date;
}) {
  const [row] = await db
    .select({ total: count() })
    .from(monitorEvents)
    .where(
      and(
        eq(monitorEvents.monitorId, input.monitorId),
        eq(monitorEvents.eventType, input.eventType),
        gte(monitorEvents.createdAt, input.since),
        lte(monitorEvents.createdAt, input.before)
      )
    );

  return row?.total ?? 0;
}

export async function appendMonitorCheck(input: {
  monitorId: string;
  workspaceId?: string;
  userId: string;
  status: "up" | "down" | "pending";
  statusCode?: number | null;
  latencyMs?: number | null;
  createdAt: Date;
}) {
  const workspaceId = input.workspaceId ?? await requireWorkspaceIdForUser(input.userId);
  await db.insert(monitorChecks).values({
    workspaceId,
    monitorId: input.monitorId,
    userId: input.userId,
    status: input.status,
    statusCode: input.statusCode ?? null,
    latencyMs: input.latencyMs ?? null,
    createdAt: input.createdAt,
  });
}

export async function appendMonitorDiagnostic(input: {
  monitorId: string;
  workspaceId?: string;
  userId: string;
  diagnostic: MonitorDiagnosticResult;
}) {
  const workspaceId = input.workspaceId ?? await requireWorkspaceIdForUser(input.userId);
  await db.insert(monitorDiagnostics).values({
    workspaceId,
    monitorId: input.monitorId,
    userId: input.userId,
    status: input.diagnostic.status,
    failedPhase: input.diagnostic.failedPhase,
    failureCategory: input.diagnostic.failureCategory,
    summary: input.diagnostic.summary,
    dnsStatus: input.diagnostic.dnsStatus,
    resolvedIps: input.diagnostic.resolvedIps,
    tcpStatus: input.diagnostic.tcpStatus,
    tlsStatus: input.diagnostic.tlsStatus,
    httpStatus: input.diagnostic.httpStatus,
    httpStatusCode: input.diagnostic.httpStatusCode,
    responseTimeMs: input.diagnostic.responseTimeMs,
    timeoutMs: input.diagnostic.timeoutMs,
    errorMessage: input.diagnostic.errorMessage,
    createdAt: input.diagnostic.createdAt,
  });
}

export async function appendOutageEvent(input: {
  outageId?: string | null;
  monitorId: string;
  workspaceId?: string;
  userId: string;
  eventType: string;
  title: string;
  detail?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
}) {
  const workspaceId = input.workspaceId ?? await requireWorkspaceIdForUser(input.userId);
  await db.insert(outageEvents).values({
    workspaceId,
    outageId: input.outageId ?? null,
    monitorId: input.monitorId,
    userId: input.userId,
    eventType: input.eventType,
    title: input.title,
    detail: input.detail ?? null,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    createdAt: input.createdAt ?? new Date(),
  });
}

export async function getWorkerState() {
  const [state] = await db.select().from(workerState).where(eq(workerState.id, WORKER_STATE_ID));

  if (state) {
    return state;
  }

  const [created] = await db
    .insert(workerState)
    .values({ id: WORKER_STATE_ID, desiredState: "stopped", running: false })
    .onConflictDoNothing({ target: workerState.id })
    .returning();

  if (created) {
    return created;
  }

  const [existing] = await db.select().from(workerState).where(eq(workerState.id, WORKER_STATE_ID));
  if (!existing) {
    throw new Error("Worker state could not be initialized.");
  }

  return existing;
}

export async function updateWorkerState(values: Partial<typeof workerState.$inferInsert>) {
  await getWorkerState();

  const [state] = await db
    .update(workerState)
    .set({
      ...values,
      updatedAt: new Date(),
    })
    .where(eq(workerState.id, WORKER_STATE_ID))
    .returning();

  return state;
}

export async function incrementWorkerCheckedCount(amount = 1) {
  await getWorkerState();

  const increment = Math.max(0, amount);
  const [state] = await db
    .update(workerState)
    .set({
      checkedCount: sql`${workerState.checkedCount} + ${increment}`,
      updatedAt: new Date(),
    })
    .where(eq(workerState.id, WORKER_STATE_ID))
    .returning();

  return state;
}

