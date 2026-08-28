import { and, eq, ne, or } from "drizzle-orm";
import { AuthError } from "@/lib/auth/errors";
import { db, type DatabaseExecutor } from "@/lib/db";
import { monitors, type Monitor } from "@/lib/db/schema";
import { buildHeartbeatMonitorTarget } from "@/lib/monitors/targets";
import { encryptValue, hashSecretValue, isEncryptedValue } from "@/lib/security/encryption";

export async function encryptLegacyClaimedSecrets(claimed: Monitor[]) {
  const legacyTelegramTokens = claimed.filter((monitor) =>
    monitor.telegramBotToken && !isEncryptedValue(monitor.telegramBotToken)
  );
  const legacyHeartbeatTokens = claimed.filter((monitor) =>
    monitor.monitorType === "heartbeat"
    && monitor.heartbeatToken
    && !isEncryptedValue(monitor.heartbeatToken)
  );

  await Promise.all(legacyTelegramTokens.map((monitor) =>
    db
      .update(monitors)
      .set({ telegramBotToken: encryptValue(monitor.telegramBotToken as string) })
      .where(eq(monitors.id, monitor.id))
  ));
  await Promise.all(legacyHeartbeatTokens.map(migrateLegacyHeartbeatToken));
}

async function migrateLegacyHeartbeatToken(monitor: Monitor) {
  const token = monitor.heartbeatToken as string;
  const tokenHash = hashSecretValue("heartbeat-token", token);
  try {
    await db
      .update(monitors)
      .set({
        heartbeatToken: encryptValue(token),
        heartbeatTokenHash: tokenHash,
        url: buildHeartbeatMonitorTarget(tokenHash),
      })
      .where(eq(monitors.id, monitor.id));
  } catch (error) {
    console.error(`[sentrovia] Legacy heartbeat token migration deferred for monitor ${monitor.id}.`, error);
  }
}

export async function assertHeartbeatTokenAvailable(
  token: string,
  tokenHash: string,
  existingMonitorId: string | null,
  database: DatabaseExecutor
) {
  const [conflict] = await database
    .select({ id: monitors.id })
    .from(monitors)
    .where(and(
      eq(monitors.monitorType, "heartbeat"),
      or(eq(monitors.heartbeatTokenHash, tokenHash), eq(monitors.heartbeatToken, token)),
      existingMonitorId ? ne(monitors.id, existingMonitorId) : undefined
    ))
    .limit(1);
  if (conflict) {
    throw new AuthError("This heartbeat token is already assigned to another monitor.", 409);
  }
}

