import { and, desc, eq, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/errors";
import { db } from "@/lib/db";
import { monitorImportRuns } from "@/lib/db/schema";
import { createManyMonitors, deleteMonitors } from "@/lib/monitors/service";
import type { MonitorInput } from "@/lib/monitors/schemas";

export type MonitorImportRunRecord = typeof monitorImportRuns.$inferSelect;

export async function importMonitorsWithHistory(input: {
  userId: string;
  workspaceId: string;
  fileName: string;
  source: "csv" | "txt";
  monitors: MonitorInput[];
}) {
  return db.transaction(async (tx) => {
    const created = await createManyMonitors(input.userId, input.monitors, tx, input.workspaceId);
    const [run] = await tx.insert(monitorImportRuns).values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      fileName: input.fileName.slice(0, 255),
      source: input.source,
      addedCount: created.length,
      skippedCount: Math.max(0, input.monitors.length - created.length),
      createdMonitorIds: created.map((monitor) => monitor.id),
    }).returning();
    return { created, run };
  });
}

export async function listMonitorImportRuns(workspaceId: string, limit = 20) {
  return db.select().from(monitorImportRuns)
    .where(eq(monitorImportRuns.workspaceId, workspaceId))
    .orderBy(desc(monitorImportRuns.createdAt), desc(monitorImportRuns.id))
    .limit(limit);
}

export async function undoLatestMonitorImport(userId: string, workspaceId: string, runId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`monitor-import-undo:${workspaceId}`}))`);
    const [latest] = await tx.select().from(monitorImportRuns)
      .where(and(eq(monitorImportRuns.workspaceId, workspaceId), eq(monitorImportRuns.status, "completed")))
      .orderBy(desc(monitorImportRuns.createdAt), desc(monitorImportRuns.id))
      .limit(1);
    if (!latest || latest.id !== runId) {
      throw new AuthError("Only the latest completed import can be undone.", 409);
    }
    const removed = latest.createdMonitorIds.length > 0
      ? await deleteMonitors(userId, latest.createdMonitorIds, workspaceId, tx)
      : [];
    const [updated] = await tx.update(monitorImportRuns).set({ status: "undone", undoneAt: new Date() })
      .where(and(eq(monitorImportRuns.id, runId), eq(monitorImportRuns.workspaceId, workspaceId), eq(monitorImportRuns.status, "completed")))
      .returning();
    if (!updated) throw new AuthError("This import has already been undone.", 409);
    return { run: updated, removedCount: removed.length };
  });
}
