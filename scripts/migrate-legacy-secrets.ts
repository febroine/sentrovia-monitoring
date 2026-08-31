import crypto from "node:crypto";
import { and, asc, eq, gt, isNotNull, ne, or } from "drizzle-orm";
import { db, sql as databaseConnection } from "@/lib/db";
import { auditEvents, monitors, securityMigrations, userSettings, webhookEndpoints } from "@/lib/db/schema";
import { buildHeartbeatMonitorTarget } from "@/lib/monitors/targets";
import { encryptValue, hashSecretValue, isEncryptedValue } from "@/lib/security/encryption";

const MIGRATION_BATCH_SIZE = 200;
const MIGRATION_ID = "encrypt-legacy-secrets-v1";

async function main() {
  const [completed] = await db
    .select({ id: securityMigrations.id })
    .from(securityMigrations)
    .where(eq(securityMigrations.id, MIGRATION_ID))
    .limit(1);
  if (completed) {
    console.log("Sensitive data migration already completed.");
    return;
  }

  const monitorResult = await migrateMonitorSecrets();
  const settingsMigrated = await migrateDiscordWebhookUrls();
  const endpointsMigrated = await migrateGenericWebhookUrls();
  const total = monitorResult.migrated + settingsMigrated + endpointsMigrated;
  await db.insert(securityMigrations).values({ id: MIGRATION_ID }).onConflictDoNothing();

  console.log(
    `Sensitive data migration complete: ${total} value(s) encrypted, ${monitorResult.rotated} duplicate heartbeat token(s) rotated.`
  );
}

async function migrateMonitorSecrets() {
  let cursor = "";
  let migrated = 0;
  let rotated = 0;

  while (true) {
    const rows = await db
      .select({
        id: monitors.id,
        userId: monitors.userId,
        name: monitors.name,
        heartbeatToken: monitors.heartbeatToken,
        telegramBotToken: monitors.telegramBotToken,
      })
      .from(monitors)
      .where(and(
        cursor ? gt(monitors.id, cursor) : undefined,
        or(isNotNull(monitors.heartbeatToken), isNotNull(monitors.telegramBotToken))
      ))
      .orderBy(asc(monitors.id))
      .limit(MIGRATION_BATCH_SIZE);
    if (rows.length === 0) break;

    for (const row of rows) {
      const result = await migrateMonitorSecretRow(row);
      migrated += result.migrated;
      rotated += result.rotated;
    }
    cursor = rows.at(-1)?.id ?? cursor;
  }

  return { migrated, rotated };
}

async function migrateMonitorSecretRow(row: {
  id: string;
  userId: string;
  name: string;
  heartbeatToken: string | null;
  telegramBotToken: string | null;
}) {
  let migrated = 0;
  let rotated = 0;

  if (row.telegramBotToken && !isEncryptedValue(row.telegramBotToken)) {
    await db
      .update(monitors)
      .set({ telegramBotToken: encryptValue(row.telegramBotToken) })
      .where(eq(monitors.id, row.id));
    migrated += 1;
  }

  if (row.heartbeatToken && !isEncryptedValue(row.heartbeatToken)) {
    rotated = await migrateHeartbeatToken(row);
    migrated += 1;
  }

  return { migrated, rotated };
}

async function migrateHeartbeatToken(row: {
  id: string;
  userId: string;
  name: string;
  heartbeatToken: string | null;
}) {
  const token = row.heartbeatToken as string;
  const tokenHash = hashSecretValue("heartbeat-token", token);

  return db.transaction(async (tx) => {
    const [conflict] = await tx
      .select({
        id: monitors.id,
        workspaceId: monitors.workspaceId,
        userId: monitors.userId,
        name: monitors.name,
      })
      .from(monitors)
      .where(and(eq(monitors.heartbeatTokenHash, tokenHash), ne(monitors.id, row.id)))
      .limit(1);
    if (conflict) {
      await rotateConflictingHeartbeatToken(conflict, tx);
    }

    await tx
      .update(monitors)
      .set({
        heartbeatToken: encryptValue(token),
        heartbeatTokenHash: tokenHash,
        url: buildHeartbeatMonitorTarget(tokenHash),
        updatedAt: new Date(),
      })
      .where(eq(monitors.id, row.id));
    return conflict ? 1 : 0;
  });
}

async function rotateConflictingHeartbeatToken(
  monitor: { id: string; workspaceId: string; userId: string; name: string },
  executor: Parameters<Parameters<typeof db.transaction>[0]>[0]
) {
  const replacement = crypto.randomUUID();
  const replacementHash = hashSecretValue("heartbeat-token", replacement);
  await executor
    .update(monitors)
    .set({
      heartbeatToken: encryptValue(replacement),
      heartbeatTokenHash: replacementHash,
      url: buildHeartbeatMonitorTarget(replacementHash),
      updatedAt: new Date(),
    })
    .where(eq(monitors.id, monitor.id));
  await executor.insert(auditEvents).values({
    workspaceId: monitor.workspaceId,
    userId: monitor.userId,
    actorUserId: null,
    actorLabel: "Sentrovia security migration",
    entityType: "monitor",
    entityId: monitor.id,
    entityLabel: monitor.name,
    action: "monitor.heartbeat-token.rotated",
    summary: "A duplicate heartbeat token was rotated during secure data migration.",
  });
}

async function migrateDiscordWebhookUrls() {
  let cursor = "";
  let migrated = 0;

  while (true) {
    const rows = await db
      .select({ userId: userSettings.userId, url: userSettings.discordWebhookUrl })
      .from(userSettings)
      .where(and(
        cursor ? gt(userSettings.userId, cursor) : undefined,
        isNotNull(userSettings.discordWebhookUrl)
      ))
      .orderBy(asc(userSettings.userId))
      .limit(MIGRATION_BATCH_SIZE);
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row.url || isEncryptedValue(row.url)) continue;
      await db
        .update(userSettings)
        .set({ discordWebhookUrl: encryptValue(row.url), updatedAt: new Date() })
        .where(eq(userSettings.userId, row.userId));
      migrated += 1;
    }
    cursor = rows.at(-1)?.userId ?? cursor;
  }

  return migrated;
}

async function migrateGenericWebhookUrls() {
  let cursor = "";
  let migrated = 0;

  while (true) {
    const rows = await db
      .select({ id: webhookEndpoints.id, url: webhookEndpoints.url })
      .from(webhookEndpoints)
      .where(and(
        cursor ? gt(webhookEndpoints.id, cursor) : undefined,
        isNotNull(webhookEndpoints.url)
      ))
      .orderBy(asc(webhookEndpoints.id))
      .limit(MIGRATION_BATCH_SIZE);
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row.url || isEncryptedValue(row.url)) continue;
      await db
        .update(webhookEndpoints)
        .set({ url: encryptValue(row.url), updatedAt: new Date() })
        .where(eq(webhookEndpoints.id, row.id));
      migrated += 1;
    }
    cursor = rows.at(-1)?.id ?? cursor;
  }

  return migrated;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Sensitive data migration failed.");
    process.exitCode = 1;
  })
  .finally(() => databaseConnection.end({ timeout: 1 }).catch(() => undefined));
