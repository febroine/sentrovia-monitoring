import { asc, eq } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/lib/db";
import { workspaceMembers, workspaces } from "@/lib/db/schema";

export type WorkspaceScope = {
  workspaceId: string;
  userId: string;
};

export type WorkspaceSubject = string | WorkspaceScope;

export async function findWorkspaceIdForUser(
  userId: string,
  database: DatabaseExecutor = db
) {
  const [membership] = await database
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaceMembers.createdAt), asc(workspaceMembers.workspaceId))
    .limit(1);

  return membership?.workspaceId ?? null;
}

export async function requireWorkspaceIdForUser(
  userId: string,
  database: DatabaseExecutor = db
) {
  const workspaceId = await findWorkspaceIdForUser(userId, database);
  if (!workspaceId) {
    throw new Error("The user does not belong to an active workspace.");
  }
  return workspaceId;
}

export async function resolveWorkspaceScope(
  subject: WorkspaceSubject,
  database: DatabaseExecutor = db
): Promise<WorkspaceScope> {
  if (typeof subject !== "string") {
    return subject;
  }
  return {
    userId: subject,
    workspaceId: await requireWorkspaceIdForUser(subject, database),
  };
}

export async function findDefaultWorkspaceId(database: DatabaseExecutor = db) {
  const [workspace] = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .orderBy(asc(workspaces.createdAt), asc(workspaces.id))
    .limit(1);
  return workspace?.id ?? null;
}
