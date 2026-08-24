import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";

export type AuditEventInput = {
  userId: string | null;
  actorUserId: string | null;
  actorLabel: string;
  entityType: string;
  entityId?: string | null;
  entityLabel: string;
  action: string;
  summary: string;
};

export async function recordAuditEvent(input: AuditEventInput) {
  await db.insert(auditEvents).values({
    ...input,
    actorLabel: normalizeLabel(input.actorLabel),
    entityLabel: normalizeLabel(input.entityLabel),
    action: input.action.slice(0, 64),
    entityType: input.entityType.slice(0, 32),
    summary: input.summary.slice(0, 2_000),
  });
}

export async function recordAuditEventSafely(input: AuditEventInput) {
  try {
    await recordAuditEvent(input);
  } catch (error) {
    console.error("[sentrovia] Unable to persist a security audit event.", error);
  }
}

function normalizeLabel(value: string) {
  const normalized = value.trim();
  return (normalized || "Unknown").slice(0, 255);
}
