import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db, type DatabaseExecutor } from "@/lib/db";
import { monitors } from "@/lib/db/schema";
import { MAX_HEARTBEAT_TOKEN_LENGTH, MIN_HEARTBEAT_TOKEN_LENGTH } from "@/lib/monitors/constants";
import { appendMonitorEvent } from "@/lib/monitors/runtime-store";
import { buildHeartbeatMonitorTarget } from "@/lib/monitors/targets";
import { encryptValue, hashSecretValue } from "@/lib/security/encryption";

export async function receiveHeartbeat(token: string, receivedAt = new Date()) {
  const normalizedToken = normalizeHeartbeatTokenInput(token);
  if (!normalizedToken) return null;
  return db.transaction((tx) => receiveHeartbeatTransaction(tx, normalizedToken, receivedAt));
}

async function receiveHeartbeatTransaction(
  tx: DatabaseExecutor,
  normalizedToken: string,
  receivedAt: Date
) {
  const tokenHash = hashSecretValue("heartbeat-token", normalizedToken);
  const { hashedMonitor, legacyMonitor } = await findHeartbeatCandidates(tx, normalizedToken, tokenHash);
  const foundMonitor = legacyMonitor ?? hashedMonitor;
  if (!foundMonitor) return null;

  const existingMonitor = await migrateLegacyHeartbeatToken(
    tx,
    foundMonitor,
    legacyMonitor,
    hashedMonitor,
    normalizedToken,
    tokenHash
  );
  if (!existingMonitor.isActive) {
    return { accepted: false, paused: true, monitor: existingMonitor, receivedAt };
  }

  const monitor = await updateHeartbeatReceipt(tx, existingMonitor.id, receivedAt);
  if (!monitor) {
    return resolveHeartbeatUpdateRace(tx, existingMonitor, normalizedToken, tokenHash, receivedAt);
  }

  await appendMonitorEvent({
    monitorId: monitor.id,
    userId: monitor.userId,
    eventType: "heartbeat-received",
    status: monitor.status,
    statusCode: monitor.statusCode,
    latencyMs: null,
    message: "Heartbeat ping received from the external job.",
  }, tx);
  return { accepted: true, paused: false, monitor, receivedAt };
}

async function findHeartbeatCandidates(tx: DatabaseExecutor, token: string, tokenHash: string) {
  const [legacyMonitor] = await tx.select().from(monitors).where(and(
    eq(monitors.monitorType, "heartbeat"),
    eq(monitors.heartbeatToken, token),
    isNull(monitors.deletedAt)
  )).limit(1);
  const [hashedMonitor] = await tx.select().from(monitors).where(and(
    eq(monitors.monitorType, "heartbeat"),
    eq(monitors.heartbeatTokenHash, tokenHash),
    isNull(monitors.deletedAt)
  )).limit(1);
  return { hashedMonitor, legacyMonitor };
}

type HeartbeatMonitor = typeof monitors.$inferSelect;

async function migrateLegacyHeartbeatToken(
  tx: DatabaseExecutor,
  foundMonitor: HeartbeatMonitor,
  legacyMonitor: HeartbeatMonitor | undefined,
  hashedMonitor: HeartbeatMonitor | undefined,
  token: string,
  tokenHash: string
) {
  if (legacyMonitor && hashedMonitor && legacyMonitor.id !== hashedMonitor.id) return foundMonitor;
  const [migratedMonitor] = await tx.update(monitors).set({
    heartbeatToken: encryptValue(token),
    heartbeatTokenHash: tokenHash,
    url: buildHeartbeatMonitorTarget(tokenHash),
    updatedAt: new Date(),
  }).where(eq(monitors.id, foundMonitor.id)).returning();
  return migratedMonitor ?? foundMonitor;
}

async function updateHeartbeatReceipt(tx: DatabaseExecutor, monitorId: string, receivedAt: Date) {
  const [monitor] = await tx.update(monitors).set({
    heartbeatLastReceivedAt: receivedAt,
    nextCheckAt: receivedAt,
    leaseToken: null,
    leaseExpiresAt: null,
    updatedAt: new Date(),
  }).where(and(
    eq(monitors.id, monitorId),
    eq(monitors.isActive, true),
    isNull(monitors.deletedAt),
    or(isNull(monitors.heartbeatLastReceivedAt), lte(monitors.heartbeatLastReceivedAt, receivedAt))
  )).returning();
  return monitor ?? null;
}

async function resolveHeartbeatUpdateRace(
  tx: DatabaseExecutor,
  existingMonitor: HeartbeatMonitor,
  token: string,
  tokenHash: string,
  receivedAt: Date
) {
  const [currentMonitor] = await tx.select().from(monitors).where(and(
    eq(monitors.id, existingMonitor.id),
    or(eq(monitors.heartbeatTokenHash, tokenHash), eq(monitors.heartbeatToken, token)),
    isNull(monitors.deletedAt)
  )).limit(1);
  return currentMonitor?.isActive
    ? { accepted: true, paused: false, monitor: currentMonitor, receivedAt }
    : { accepted: false, paused: true, monitor: currentMonitor ?? existingMonitor, receivedAt };
}

export function normalizeHeartbeatTokenInput(token: string) {
  const normalized = token.trim();
  if (
    normalized.length < MIN_HEARTBEAT_TOKEN_LENGTH ||
    normalized.length > MAX_HEARTBEAT_TOKEN_LENGTH
  ) {
    return null;
  }

  return normalized;
}
