import crypto from "node:crypto";
import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { deliveryEvents, webhookEndpoints } from "@/lib/db/schema";
import { escapeHtml } from "@/lib/html";
import { sanitizeMonitorUrlForDisplay } from "@/lib/monitors/targets";
import { getMonitorNotificationRouting } from "@/lib/notifications/routing";
import {
  decryptValue,
  decryptValueOrLegacyPlaintext,
  encryptValue,
} from "@/lib/security/encryption";
import { canUserAccessPrivateTargets } from "@/lib/security/network-policy";
import {
  resolveMonitorNetworkTargetWithTimeout,
  selectResolvedAddress,
} from "@/lib/security/public-network-target";
import {
  assertSafeWebhookUrl,
  isWebhookSafetyError,
  postSafeWebhook,
} from "@/lib/security/webhook-safety";
import { getSettings } from "@/lib/settings/service";
import { getSmtpSettings } from "@/lib/settings/smtp";
import type {
  DeliveryHistoryRecord,
  DeliveryHistoryDeletionRange,
  DeliveryChannelHealth,
  DeliveryKind,
  DeliveryOverview,
  DeliveryTestInput,
  WebhookSettingsInput,
} from "@/lib/delivery/types";
import {
  buildDeliveryAbortSignal,
  DELIVERY_REQUEST_TIMEOUT_MS,
  readLimitedResponseText,
  safeJsonParse,
} from "@/lib/delivery/transport-utils";
import {
  normalizeTelegramMessage,
  postTelegramMessage,
  readTelegramResponseFailure,
  resolveTelegramPhoto,
  sendTelegramPhotoWithoutBlockingMessage,
  toTelegramErrorMessage,
} from "@/lib/delivery/telegram-delivery";

const DELIVERY_HISTORY_PAGE_SIZE = 10;
const MAX_DELIVERY_ATTEMPTS = 5;
const DELIVERY_RETRY_DELAY_MS = 5 * 60 * 1000;
const DELIVERY_CLAIM_LEASE_MS = 2 * 60 * 1000;
const DELIVERY_QUEUE_STATUSES = ["pending", "retrying", "processing"] as const;
const DELIVERY_HISTORY_DELETABLE_STATUSES = ["delivered", "failed"];
const DELIVERY_RETRY_BATCH_SIZE = 20;
const DELIVERY_HEALTH_WINDOW_MS = 24 * 60 * 60 * 1000;
const DELIVERY_PENDING_STALE_MS = 2 * 60 * 1000;
const DELIVERY_CHANNELS = ["email", "telegram", "discord", "webhook"] as const;
const DELIVERY_CHANNEL_HEALTH_STATUSES = ["delivered", "failed", "retrying", "processing", "pending"] as const;

type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];
type DeliveryHealthAggregateRow = { channel: string; status: string; total: number | string };
type DeliveryHealthLatestRow = {
  channel: string;
  status: string;
  createdAt: Date;
  lastAttemptAt: Date | null;
  errorMessage: string | null;
};
type DeliveryEventRow = typeof deliveryEvents.$inferSelect;
type DeliveryQueueOptions = {
  userId?: string;
  channels?: readonly DeliveryChannel[];
};

function deliveryHealthWindowWhere(since: Date) {
  return or(
    gte(deliveryEvents.lastAttemptAt, since),
    and(isNull(deliveryEvents.lastAttemptAt), gte(deliveryEvents.createdAt, since))
  );
}

export async function getDeliveryOverview(userId: string, requestedPage = 1): Promise<DeliveryOverview> {
  const healthSince = new Date(Date.now() - DELIVERY_HEALTH_WINDOW_MS);
  const [endpoint, totalRows, summary, healthRows, latestHealthRows] = await Promise.all([
    getWebhookEndpoint(userId),
    db
      .select({ total: count() })
      .from(deliveryEvents)
      .where(eq(deliveryEvents.userId, userId)),
    getDeliverySummary(userId),
    db
      .select({ channel: deliveryEvents.channel, status: deliveryEvents.status, total: count() })
      .from(deliveryEvents)
      .where(and(eq(deliveryEvents.userId, userId), deliveryHealthWindowWhere(healthSince)))
      .groupBy(deliveryEvents.channel, deliveryEvents.status),
    Promise.all(DELIVERY_CHANNELS.map((channel) =>
      db
        .select({
          channel: deliveryEvents.channel,
          status: deliveryEvents.status,
          createdAt: deliveryEvents.createdAt,
          lastAttemptAt: deliveryEvents.lastAttemptAt,
          errorMessage: deliveryEvents.errorMessage,
        })
        .from(deliveryEvents)
        .where(and(
          eq(deliveryEvents.userId, userId),
          eq(deliveryEvents.channel, channel),
          deliveryHealthWindowWhere(healthSince)
        ))
        .orderBy(desc(deliveryEvents.lastAttemptAt), desc(deliveryEvents.createdAt))
        .limit(1)
    )),
  ]);

  const totalItems = Number(totalRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalItems / DELIVERY_HISTORY_PAGE_SIZE));
  const page = Math.min(normalizeDeliveryPage(requestedPage), totalPages);
  const historyRows = await db
    .select()
    .from(deliveryEvents)
    .where(eq(deliveryEvents.userId, userId))
    .orderBy(desc(deliveryEvents.createdAt), desc(deliveryEvents.id))
    .limit(DELIVERY_HISTORY_PAGE_SIZE)
    .offset((page - 1) * DELIVERY_HISTORY_PAGE_SIZE);

  const history = historyRows.map(serializeDelivery);
  return {
    webhook: endpoint
      ? {
          url: decryptValueOrLegacyPlaintext(endpoint.url) ?? "",
          isActive: endpoint.isActive,
          secretConfigured: Boolean(decryptValue(endpoint.secretEncrypted)),
        }
      : null,
    history,
    summary,
    channelHealth: buildDeliveryChannelHealth(
      healthRows,
      latestHealthRows.flat()
    ),
    pagination: { page, pageSize: DELIVERY_HISTORY_PAGE_SIZE, totalItems, totalPages },
  };
}

export async function getDeliverySummary(userId: string): Promise<DeliveryOverview["summary"]> {
  const [row] = await db
    .select({
      delivered: sql<number>`count(*) filter (where ${deliveryEvents.status} = 'delivered')::integer`,
      failed: sql<number>`count(*) filter (where ${deliveryEvents.status} = 'failed')::integer`,
      retrying: sql<number>`count(*) filter (where ${deliveryEvents.status} = 'retrying')::integer`,
      pendingWebhookRetries: sql<number>`count(*) filter (where ${deliveryEvents.channel} = 'webhook' and ${deliveryEvents.status} in ('pending', 'retrying', 'processing'))::integer`,
      pendingRetries: sql<number>`count(*) filter (where ${deliveryEvents.status} in ('pending', 'retrying', 'processing'))::integer`,
      deadLettered: sql<number>`count(*) filter (where ${deliveryEvents.status} = 'failed' and ${deliveryEvents.deadLetteredAt} is not null)::integer`,
    })
    .from(deliveryEvents)
    .where(eq(deliveryEvents.userId, userId));

  return normalizeDeliverySummary(row);
}

export function normalizeDeliverySummary(
  row: Partial<Record<keyof DeliveryOverview["summary"], number | string | null>> | undefined
): DeliveryOverview["summary"] {
  return {
    delivered: Number(row?.delivered ?? 0),
    failed: Number(row?.failed ?? 0),
    retrying: Number(row?.retrying ?? 0),
    pendingWebhookRetries: Number(row?.pendingWebhookRetries ?? 0),
    pendingRetries: Number(row?.pendingRetries ?? 0),
    deadLettered: Number(row?.deadLettered ?? 0),
  };
}

export function buildDeliveryChannelHealth(
  aggregateRows: DeliveryHealthAggregateRow[],
  latestRows: DeliveryHealthLatestRow[]
): DeliveryChannelHealth[] {
  return DELIVERY_CHANNELS.map((channel) => {
    const counts = new Map(
      aggregateRows
        .filter((row) => row.channel === channel && isDeliveryHealthStatus(row.status))
        .map((row) => [row.status, Number(row.total)])
    );
    const delivered = counts.get("delivered") ?? 0;
    const failed = counts.get("failed") ?? 0;
    const retrying = (counts.get("retrying") ?? 0) + (counts.get("processing") ?? 0) + (counts.get("pending") ?? 0);
    const totalAttempts = delivered + failed + retrying;
    const terminalAttempts = delivered + failed;
    const errorRatePct = terminalAttempts > 0 ? Math.round((failed / terminalAttempts) * 1000) / 10 : null;
    const latest = latestRows.find((row) => row.channel === channel) ?? null;

    return {
      channel,
      totalAttempts,
      delivered,
      failed,
      retrying,
      errorRatePct,
      status: resolveChannelHealthStatus(totalAttempts, failed, retrying, errorRatePct),
      lastAttemptAt: latest?.lastAttemptAt?.toISOString() ?? latest?.createdAt.toISOString() ?? null,
      lastErrorMessage: latest && latest.status !== "delivered" ? latest.errorMessage : null,
    };
  });
}

function isDeliveryHealthStatus(value: string): value is (typeof DELIVERY_CHANNEL_HEALTH_STATUSES)[number] {
  return DELIVERY_CHANNEL_HEALTH_STATUSES.includes(
    value as (typeof DELIVERY_CHANNEL_HEALTH_STATUSES)[number]
  );
}

function resolveChannelHealthStatus(
  totalAttempts: number,
  failed: number,
  retrying: number,
  errorRatePct: number | null
): DeliveryChannelHealth["status"] {
  if (totalAttempts === 0) {
    return "unknown";
  }

  if (failed > 0 && (errorRatePct ?? 0) >= 50) {
    return "unhealthy";
  }

  if (failed > 0 || retrying > 0) {
    return "degraded";
  }

  return "healthy";
}

export async function hasRecentFailedNotificationDelivery(input: {
  userId: string;
  monitorId: string;
  kind: DeliveryKind;
  since: Date;
  before: Date;
}) {
  const [event] = await db
    .select({ id: deliveryEvents.id })
    .from(deliveryEvents)
    .where(
      and(
        eq(deliveryEvents.userId, input.userId),
        eq(deliveryEvents.monitorId, input.monitorId),
        eq(deliveryEvents.kind, input.kind),
        eq(deliveryEvents.status, "failed"),
        gte(deliveryEvents.createdAt, input.since),
        lte(deliveryEvents.createdAt, input.before)
      )
    )
    .limit(1);

  return Boolean(event);
}

export async function deleteDeliveryHistory(userId: string, range: DeliveryHistoryDeletionRange) {
  if (!isValidDeletionRange(range)) {
    throw new Error("Invalid delivery history deletion range.");
  }

  const result = await db
    .delete(deliveryEvents)
    .where(
      and(
        eq(deliveryEvents.userId, userId),
        gte(deliveryEvents.createdAt, range.from),
        lt(deliveryEvents.createdAt, range.toExclusive),
        inArray(deliveryEvents.status, DELIVERY_HISTORY_DELETABLE_STATUSES)
      )
    );

  return result.count;
}

function normalizeDeliveryPage(value: number) {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function isValidDeletionRange(range: DeliveryHistoryDeletionRange) {
  return !Number.isNaN(range.from.getTime())
    && !Number.isNaN(range.toExclusive.getTime())
    && range.from < range.toExclusive;
}

export async function upsertWebhookSettings(userId: string, input: WebhookSettingsInput) {
  const safeUrl = await assertSafeWebhookUrl(input.url);
  const [existing] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.userId, userId));
  const secretEncrypted = input.secret.trim()
    ? encryptValue(input.secret.trim())
    : existing?.secretEncrypted ?? null;

  const values = {
    userId,
    url: encryptValue(safeUrl),
    secretEncrypted,
    isActive: input.isActive,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(webhookEndpoints).set(values).where(eq(webhookEndpoints.userId, userId));
  } else {
    await db.insert(webhookEndpoints).values(values);
  }

  return getWebhookEndpoint(userId);
}

export async function sendDeliveryTest(userId: string, input: DeliveryTestInput) {
  const message = input.message?.trim() || "Sentrovia test delivery from the integrations console.";

  if (input.channel === "email") {
    return sendEmailDelivery({
      userId,
      kind: "test",
      destinationOverride: input.destination?.trim() || null,
      subject: "Sentrovia test email",
      textBody: message,
      htmlBody: `<p>${escapeHtml(message)}</p>`,
    });
  }

  if (input.channel === "telegram") {
    return sendTelegramDelivery({
      userId,
      kind: "test",
      botToken: input.botToken?.trim() || "",
      chatId: input.chatId?.trim() || "",
      body: message,
    });
  }

  if (input.channel === "discord") {
    return sendChannelWebhookDelivery(userId, "discord", "test", message);
  }

  return sendWebhookDelivery(userId, "test", {
    event: "test",
    message,
    sentAt: new Date().toISOString(),
  });
}

export async function sendEmailDelivery(input: {
  userId: string;
  kind: DeliveryKind;
  monitorId?: string | null;
  destinationOverride?: string | null;
  subject: string;
  textBody: string;
  htmlBody: string;
  attachments?: Mail.Attachment[];
  buildAttachments?: () => Promise<Mail.Attachment[] | undefined>;
}) {
  const smtp = await getSmtpSettings(input.userId);
  const destination = input.destinationOverride?.trim() || smtp?.defaultToEmail?.trim() || "";
  const event = await createDeliveryEvent(input.userId, "email", input.kind, destination || "Email not configured", {
    subject: input.subject,
    textBody: input.textBody,
    htmlBody: input.htmlBody,
    to: destination,
    attachments: serializeEmailAttachments(input.attachments),
  }, input.monitorId);

  if (!smtp || !smtp.fromEmail || !destination) {
    return markDeliveryFailed(event.id, null, "SMTP configuration is incomplete for email delivery.");
  }

  try {
    const transporter = await createSafeSmtpTransport(input.userId, smtp);

    const attachments = await resolveEmailAttachments(input);
    await transporter.sendMail(buildEmailMessage({ ...input, attachments }, smtp.fromEmail, destination));

    return markDeliveryDelivered(event.id, 250);
  } catch (error) {
    return isRetryableDeliveryError(error)
      ? markDeliveryRetryable(event.id, 1, null, toMessage(error))
      : markDeliveryFailed(event.id, null, toMessage(error));
  }
}

function buildEmailMessage(
  input: {
    subject: string;
    textBody: string;
    htmlBody: string;
    attachments?: Mail.Attachment[];
  },
  from: string,
  to: string
): Mail.Options {
  return {
    from,
    to,
    subject: input.subject,
    text: input.textBody,
    html: input.htmlBody,
    attachments: input.attachments,
  };
}

async function resolveEmailAttachments(input: {
  attachments?: Mail.Attachment[];
  buildAttachments?: () => Promise<Mail.Attachment[] | undefined>;
}) {
  if (input.attachments) {
    return input.attachments;
  }

  if (!input.buildAttachments) {
    return undefined;
  }

  try {
    return await input.buildAttachments();
  } catch (error) {
    console.warn(`[sentrovia] Email attachments skipped: ${toMessage(error)}`);
    return undefined;
  }
}

export async function sendTelegramDelivery(input: {
  userId: string;
  kind: DeliveryKind;
  monitorId?: string | null;
  botToken: string;
  chatId: string;
  body: string;
  photo?: Mail.Attachment;
  buildPhoto?: () => Promise<Mail.Attachment | null | undefined>;
}) {
  const botToken = input.botToken.trim();
  const chatId = input.chatId.trim();
  const body = normalizeTelegramMessage(input.body);
  const destination = chatId || "Telegram not configured";
  const event = await createDeliveryEvent(input.userId, "telegram", input.kind, destination, {
    text: body,
    photo: input.photo?.filename ?? null,
  }, input.monitorId);

  if (!botToken || !chatId) {
    return markDeliveryFailed(event.id, null, "Telegram bot token or chat id is missing.");
  }

  if (!body.trim()) {
    return markDeliveryFailed(event.id, null, "Telegram message body is empty.");
  }

  try {
    const response = await postTelegramMessage(botToken, chatId, body);
    const telegramFailure = await readTelegramResponseFailure(response);

    if (telegramFailure) {
      return isRetryableHttpStatus(telegramFailure.status)
        ? markDeliveryRetryable(event.id, 1, telegramFailure.status, telegramFailure.message)
        : markDeliveryFailed(event.id, telegramFailure.status, telegramFailure.message);
    }

    const photo = await resolveTelegramPhoto({
      photo: input.photo,
      buildPhoto: input.buildPhoto,
    });
    if (photo) {
      await sendTelegramPhotoWithoutBlockingMessage(botToken, chatId, body, photo);
    }

    return markDeliveryDelivered(event.id, response.status);
  } catch (error) {
    const errorMessage = toTelegramErrorMessage(error, botToken);
    return isRetryableDeliveryError(error)
      ? markDeliveryRetryable(event.id, 1, null, errorMessage)
      : markDeliveryFailed(event.id, null, errorMessage);
  }
}

export async function sendWebhookDelivery(
  userId: string,
  kind: DeliveryKind,
  payload: Record<string, unknown>,
  monitorId?: string | null
) {
  const endpoint = await getWebhookEndpoint(userId);
  if (!endpoint?.isActive && kind !== "test") {
    return null;
  }

  const event = await createDeliveryEvent(
    userId,
    "webhook",
    kind,
    redactWebhookDestination(endpoint?.url ?? "Webhook not configured"),
    payload,
    monitorId
  );

  if (!endpoint?.isActive) {
    return markDeliveryFailed(event.id, null, "Webhook delivery is not configured or inactive.");
  }

  return attemptWebhookDelivery(event.id, endpoint.url, decryptValue(endpoint.secretEncrypted), payload);
}

export async function sendChannelWebhookDelivery(
  userId: string,
  channel: "discord",
  kind: DeliveryKind,
  message: string,
  monitorId?: string | null
) {
  const settings = await getSettings(userId);
  const destination = settings?.notifications.discordWebhookUrl;
  const enabled = settings?.notifications.discordEnabled;
  const event = await createDeliveryEvent(
    userId,
    channel,
    kind,
    redactWebhookDestination(destination || `${channel} not configured`),
    {
      text: message,
    },
    monitorId
  );

  if (!enabled || !destination) {
    return markDeliveryFailed(event.id, null, `${channel} webhook is not configured or inactive.`);
  }

  try {
    const body = { content: message };
    const response = await postSafeWebhook(destination, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: buildDeliveryAbortSignal(),
    });

    if (!response.ok) {
      const responseBody = await readLimitedResponseText(response);
      return isRetryableHttpStatus(response.status)
        ? markDeliveryRetryable(event.id, 1, response.status, responseBody || `${channel} delivery failed.`)
        : markDeliveryFailed(event.id, response.status, responseBody || `${channel} delivery failed.`);
    }

    return markDeliveryDelivered(event.id, response.status);
  } catch (error) {
    if (isWebhookSafetyError(error)) {
      return markDeliveryFailed(event.id, null, toMessage(error));
    }

    return isRetryableDeliveryError(error)
      ? markDeliveryRetryable(event.id, 1, null, toMessage(error))
      : markDeliveryFailed(event.id, null, toMessage(error));
  }
}

export async function retryWebhookQueue(userId: string) {
  const endpoint = await getWebhookEndpoint(userId);
  if (!endpoint?.isActive) return { processed: 0 };
  return retryDeliveryQueue(userId, ["webhook"]);
}

export async function retryWebhookQueueForAllUsers() {
  const activeEndpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.isActive, true));

  if (activeEndpoints.length === 0) {
    return { processed: 0 };
  }

  const userIds = activeEndpoints.map((endpoint) => endpoint.userId);
  const dueEvents = await db
    .select()
    .from(deliveryEvents)
    .where(
      and(
        eq(deliveryEvents.channel, "webhook"),
        inArray(deliveryEvents.userId, userIds),
        buildDeliveryQueueWhere()
      )
    )
    .orderBy(asc(deliveryEvents.createdAt))
    .limit(DELIVERY_RETRY_BATCH_SIZE);
  return processDeliveryEvents(dueEvents);
}

export async function retryDeliveryQueue(
  userId: string,
  channels: readonly DeliveryChannel[] = DELIVERY_CHANNELS
) {
  if (channels.length === 0) return { processed: 0 };

  const dueEvents = await db
    .select()
    .from(deliveryEvents)
    .where(buildDeliveryQueueWhere({ userId, channels }))
    .orderBy(asc(deliveryEvents.createdAt))
    .limit(DELIVERY_RETRY_BATCH_SIZE);

  return processDeliveryEvents(dueEvents);
}

export async function retryDeliveryQueueForAllUsers(
  channels: readonly DeliveryChannel[] = DELIVERY_CHANNELS
) {
  if (channels.length === 0) return { processed: 0 };

  const dueEvents = await db
    .select()
    .from(deliveryEvents)
    .where(buildDeliveryQueueWhere({ channels }))
    .orderBy(asc(deliveryEvents.createdAt))
    .limit(DELIVERY_RETRY_BATCH_SIZE);

  return processDeliveryEvents(dueEvents);
}

export async function retryDeliveryEvent(userId: string, eventId: string) {
  const [event] = await db
    .select()
    .from(deliveryEvents)
    .where(and(eq(deliveryEvents.id, eventId), eq(deliveryEvents.userId, userId)))
    .limit(1);

  if (!event || event.status !== "failed") return null;

  const claimed = await claimDeliveryEvent(event.id, {
    userId,
    allowFailed: true,
    resetAttempts: true,
  });
  if (!claimed) return null;
  return deliverClaimedDelivery(claimed);
}

function buildDeliveryQueueWhere(options: DeliveryQueueOptions = {}) {
  const now = new Date();
  const stalePendingBefore = new Date(now.getTime() - DELIVERY_PENDING_STALE_MS);

  return and(
    options.userId ? eq(deliveryEvents.userId, options.userId) : undefined,
    options.channels?.length ? inArray(deliveryEvents.channel, options.channels) : undefined,
    inArray(deliveryEvents.status, DELIVERY_QUEUE_STATUSES),
    or(isNull(deliveryEvents.claimExpiresAt), lte(deliveryEvents.claimExpiresAt, now)),
    or(isNull(deliveryEvents.nextRetryAt), lte(deliveryEvents.nextRetryAt, now)),
    or(
      inArray(deliveryEvents.status, ["retrying", "processing"]),
      and(eq(deliveryEvents.status, "pending"), lte(deliveryEvents.createdAt, stalePendingBefore))
    )
  );
}

async function processDeliveryEvents(events: DeliveryEventRow[]) {
  let processed = 0;

  for (const event of events) {
    const claimed = await claimDeliveryEvent(event.id, { userId: event.userId });
    if (!claimed) continue;

    const result = await deliverClaimedDelivery(claimed);
    if (result) processed += 1;
  }

  return { processed };
}

export async function buildNotificationWebhookPayload(input: {
  userId: string;
  kind: DeliveryKind;
  monitorName: string;
  url: string;
  status: string;
  statusCode: number | null;
  failureReason?: string | null;
  message: string;
  checkedAt: Date;
  rcaTitle: string;
  rcaSummary: string;
}) {
  const settings = await getSettings(input.userId);

  return {
    event: input.kind,
    organization: settings?.profile.organization || "Sentrovia Monitoring",
    monitor: {
      name: input.monitorName,
      url: sanitizeMonitorUrlForDisplay(input.url),
      status: input.status,
      statusCode: input.statusCode,
      failureReason: input.failureReason ?? null,
    },
    message: input.message,
    rca: {
      title: input.rcaTitle,
      summary: input.rcaSummary,
    },
    checkedAt: input.checkedAt.toISOString(),
  };
}

export async function getWebhookEndpoint(userId: string) {
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.userId, userId));

  return endpoint
    ? {
      ...endpoint,
      url: decryptValueOrLegacyPlaintext(endpoint.url) ?? "",
    }
    : null;
}

async function createDeliveryEvent(
  userId: string,
  channel: "email" | "telegram" | "webhook" | "discord",
  kind: DeliveryKind,
  destination: string,
  payload: Record<string, unknown>,
  monitorId?: string | null
) {
  const [created] = await db
    .insert(deliveryEvents)
    .values({
      userId,
      monitorId: monitorId ?? null,
      channel,
      kind,
      destination,
      payloadJson: JSON.stringify(payload),
      status: "pending",
      attempts: 0,
    })
    .returning();

  return created;
}

async function attemptWebhookDelivery(
  eventId: string,
  endpointUrl: string,
  secret: string | null,
  payload: Record<string, unknown>
) {
  const current = await claimDeliveryEvent(eventId, { allowFreshPending: true });
  if (!current) {
    return null;
  }

  return deliverWebhookClaimed(current, endpointUrl, secret, payload);
}

function redactWebhookDestination(value: string) {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}/[redacted]`;
  } catch {
    return value;
  }
}

async function deliverWebhookClaimed(
  current: DeliveryEventRow,
  endpointUrl: string,
  secret: string | null,
  payload: Record<string, unknown>
) {
  try {
    const body = JSON.stringify(payload);
    const response = await postSafeWebhook(endpointUrl, {
      headers: buildWebhookHeaders(body, secret),
      body,
      signal: buildDeliveryAbortSignal(),
    });

    if (response.ok) {
      return markDeliveryDelivered(current.id, response.status, current.attempts + 1, current.claimToken);
    }

    const responseBody = await readLimitedResponseText(response);
    return isRetryableHttpStatus(response.status)
      ? markDeliveryRetryable(
          current.id,
          current.attempts + 1,
          response.status,
          responseBody || "Webhook delivery failed.",
          current.claimToken
        )
      : markDeliveryFailed(
          current.id,
          response.status,
          responseBody || "Webhook delivery failed.",
          current.attempts + 1,
          current.claimToken
        );
  } catch (error) {
    if (isWebhookSafetyError(error)) {
      return markDeliveryFailed(current.id, null, toMessage(error), current.attempts + 1, current.claimToken);
    }

    return markDeliveryRetryable(
      current.id,
      current.attempts + 1,
      null,
      toMessage(error),
      current.claimToken
    );
  }
}

async function claimDeliveryEvent(
  eventId: string,
  options: {
    userId?: string;
    allowFailed?: boolean;
    allowFreshPending?: boolean;
    resetAttempts?: boolean;
  } = {}
) {
  const now = new Date();
  const claimToken = crypto.randomUUID();
  const eligibleStatuses = options.allowFailed
    ? [...DELIVERY_QUEUE_STATUSES, "failed"] as const
    : DELIVERY_QUEUE_STATUSES;
  const statusEligibility = options.allowFreshPending
    ? undefined
    : options.allowFailed
      ? or(
          inArray(deliveryEvents.status, ["retrying", "processing"]),
          and(eq(deliveryEvents.status, "pending"), lte(deliveryEvents.createdAt, new Date(now.getTime() - DELIVERY_PENDING_STALE_MS))),
          eq(deliveryEvents.status, "failed")
        )
      : or(
          inArray(deliveryEvents.status, ["retrying", "processing"]),
          and(eq(deliveryEvents.status, "pending"), lte(deliveryEvents.createdAt, new Date(now.getTime() - DELIVERY_PENDING_STALE_MS)))
        );
  const [claimed] = await db
    .update(deliveryEvents)
    .set({
      status: "processing",
      ...(options.resetAttempts ? { attempts: 0 } : {}),
      claimToken,
      claimExpiresAt: new Date(now.getTime() + DELIVERY_CLAIM_LEASE_MS),
      deadLetteredAt: null,
    })
    .where(
      and(
        eq(deliveryEvents.id, eventId),
        options.userId ? eq(deliveryEvents.userId, options.userId) : undefined,
        inArray(deliveryEvents.status, eligibleStatuses),
        or(isNull(deliveryEvents.claimExpiresAt), lte(deliveryEvents.claimExpiresAt, now)),
        or(isNull(deliveryEvents.nextRetryAt), lte(deliveryEvents.nextRetryAt, now)),
        statusEligibility
      )
    )
    .returning();

  return claimed ?? null;
}

async function deliverClaimedDelivery(event: DeliveryEventRow) {
  if (event.channel === "email") return deliverClaimedEmail(event);
  if (event.channel === "telegram") return deliverClaimedTelegram(event);
  if (event.channel === "discord") return deliverClaimedDiscord(event);
  if (event.channel === "webhook") {
    const endpoint = await getWebhookEndpoint(event.userId);
    if (!endpoint?.isActive) {
      return markDeliveryFailed(
        event.id,
        null,
        "Webhook delivery is not configured or inactive.",
        event.attempts + 1,
        event.claimToken
      );
    }

    return deliverWebhookClaimed(
      event,
      endpoint.url,
      decryptValue(endpoint.secretEncrypted),
      safeJsonParse(event.payloadJson)
    );
  }

  return markDeliveryFailed(
    event.id,
    null,
    `Unsupported delivery channel: ${event.channel}.`,
    event.attempts + 1,
    event.claimToken
  );
}

async function deliverClaimedEmail(event: DeliveryEventRow) {
  const smtp = await getSmtpSettings(event.userId);
  const payload = safeJsonParse(event.payloadJson);
  const payloadDestination = readPayloadString(payload, "to");
  const destination = payloadDestination || (event.destination === "Email not configured" ? "" : event.destination);
  const subject = readPayloadString(payload, "subject");
  const textBody = readPayloadString(payload, "textBody");
  const htmlBody = readPayloadString(payload, "htmlBody") || `<p>${escapeHtml(textBody)}</p>`;
  const attachments = deserializeEmailAttachments(payload.attachments);

  if (!smtp || !smtp.fromEmail || !destination || !subject || !textBody) {
    return markDeliveryFailed(
      event.id,
      null,
      "SMTP configuration or the original email payload is incomplete.",
      event.attempts + 1,
      event.claimToken
    );
  }

  try {
    const transporter = await createSafeSmtpTransport(event.userId, smtp);
    await transporter.sendMail({
      from: smtp.fromEmail,
      to: destination,
      subject,
      text: textBody,
      html: htmlBody,
      attachments,
    });
    return markDeliveryDelivered(event.id, 250, event.attempts + 1, event.claimToken);
  } catch (error) {
    return isRetryableDeliveryError(error)
      ? markDeliveryRetryable(event.id, event.attempts + 1, null, toMessage(error), event.claimToken)
      : markDeliveryFailed(event.id, null, toMessage(error), event.attempts + 1, event.claimToken);
  }
}

async function createSafeSmtpTransport(
  userId: string,
  smtp: NonNullable<Awaited<ReturnType<typeof getSmtpSettings>>>
) {
  const allowPrivateTargets = await canUserAccessPrivateTargets(userId);
  const resolvedTarget = await resolveMonitorNetworkTargetWithTimeout(
    smtp.host,
    {
      allowPrivateTargets,
      message: "SMTP server is not allowed by the current network safety policy.",
    },
    DELIVERY_REQUEST_TIMEOUT_MS
  );

  return nodemailer.createTransport({
    host: selectResolvedAddress(resolvedTarget),
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: smtp.requireTls,
    auth: smtp.username ? { user: smtp.username, pass: smtp.password } : undefined,
    tls: {
      rejectUnauthorized: !smtp.insecureSkipVerify,
      servername: smtp.host,
    },
    connectionTimeout: DELIVERY_REQUEST_TIMEOUT_MS,
    greetingTimeout: DELIVERY_REQUEST_TIMEOUT_MS,
    socketTimeout: DELIVERY_REQUEST_TIMEOUT_MS,
  });
}

async function deliverClaimedTelegram(event: DeliveryEventRow) {
  const routing = event.monitorId
    ? await getMonitorNotificationRouting(event.userId, event.monitorId)
    : null;
  if (!routing?.telegramBotToken || !routing.telegramChatId) {
    return markDeliveryFailed(
      event.id,
      null,
      "Telegram credentials are no longer configured for the monitor, company, or workspace.",
      event.attempts + 1,
      event.claimToken
    );
  }

  const body = normalizeTelegramMessage(readPayloadString(safeJsonParse(event.payloadJson), "text"));
  if (!body.trim()) {
    return markDeliveryFailed(
      event.id,
      null,
      "The original Telegram message body is empty.",
      event.attempts + 1,
      event.claimToken
    );
  }

  try {
    const response = await postTelegramMessage(routing.telegramBotToken, routing.telegramChatId, body);
    const telegramFailure = await readTelegramResponseFailure(response);
    if (telegramFailure) {
      return isRetryableHttpStatus(telegramFailure.status)
        ? markDeliveryRetryable(event.id, event.attempts + 1, telegramFailure.status, telegramFailure.message, event.claimToken)
        : markDeliveryFailed(event.id, telegramFailure.status, telegramFailure.message, event.attempts + 1, event.claimToken);
    }

    return markDeliveryDelivered(event.id, response.status, event.attempts + 1, event.claimToken);
  } catch (error) {
    const errorMessage = toTelegramErrorMessage(error, routing.telegramBotToken);
    return isRetryableDeliveryError(error)
      ? markDeliveryRetryable(event.id, event.attempts + 1, null, errorMessage, event.claimToken)
      : markDeliveryFailed(event.id, null, errorMessage, event.attempts + 1, event.claimToken);
  }
}

async function deliverClaimedDiscord(event: DeliveryEventRow) {
  const settings = await getSettings(event.userId);
  const destination = settings?.notifications.discordWebhookUrl;
  if (!settings?.notifications.discordEnabled || !destination) {
    return markDeliveryFailed(event.id, null, "Discord webhook is not configured or inactive.", event.attempts + 1, event.claimToken);
  }

  try {
    const payload = safeJsonParse(event.payloadJson);
    const response = await postSafeWebhook(destination, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: readPayloadString(payload, "text") }),
      signal: buildDeliveryAbortSignal(),
    });
    if (!response.ok) {
      const responseBody = await readLimitedResponseText(response);
      return isRetryableHttpStatus(response.status)
        ? markDeliveryRetryable(event.id, event.attempts + 1, response.status, responseBody || "Discord delivery failed.", event.claimToken)
        : markDeliveryFailed(event.id, response.status, responseBody || "Discord delivery failed.", event.attempts + 1, event.claimToken);
    }

    return markDeliveryDelivered(event.id, response.status, event.attempts + 1, event.claimToken);
  } catch (error) {
    if (isWebhookSafetyError(error)) {
      return markDeliveryFailed(event.id, null, toMessage(error), event.attempts + 1, event.claimToken);
    }

    return isRetryableDeliveryError(error)
      ? markDeliveryRetryable(event.id, event.attempts + 1, null, toMessage(error), event.claimToken)
      : markDeliveryFailed(event.id, null, toMessage(error), event.attempts + 1, event.claimToken);
  }
}

async function markDeliveryDelivered(
  eventId: string,
  responseCode: number | null,
  attempts = 1,
  claimToken?: string | null
) {
  const [updated] = await db
    .update(deliveryEvents)
    .set({
      status: "delivered",
      attempts,
      responseCode,
      errorMessage: null,
      lastAttemptAt: new Date(),
      nextRetryAt: null,
      claimToken: null,
      claimExpiresAt: null,
      deliveredAt: new Date(),
      deadLetteredAt: null,
    })
    .where(deliveryClaimWhere(eventId, claimToken))
    .returning();

  return updated;
}

async function markDeliveryRetryable(
  eventId: string,
  attempts: number,
  responseCode: number | null,
  errorMessage: string,
  claimToken?: string | null
) {
  const exhausted = attempts >= MAX_DELIVERY_ATTEMPTS;
  const [updated] = await db
    .update(deliveryEvents)
    .set({
      status: exhausted ? "failed" : "retrying",
      attempts,
      responseCode,
      errorMessage: errorMessage.slice(0, 1000),
      lastAttemptAt: new Date(),
      nextRetryAt: exhausted ? null : new Date(Date.now() + DELIVERY_RETRY_DELAY_MS),
      claimToken: null,
      claimExpiresAt: null,
      deadLetteredAt: exhausted ? new Date() : null,
    })
    .where(deliveryClaimWhere(eventId, claimToken))
    .returning();

  return updated;
}

async function markDeliveryFailed(
  eventId: string,
  responseCode: number | null,
  errorMessage: string,
  attempts = 1,
  claimToken?: string | null
) {
  const [updated] = await db
    .update(deliveryEvents)
    .set({
      status: "failed",
      attempts,
      responseCode,
      errorMessage: errorMessage.slice(0, 1000),
      lastAttemptAt: new Date(),
      nextRetryAt: null,
      claimToken: null,
      claimExpiresAt: null,
      deadLetteredAt: new Date(),
    })
    .where(deliveryClaimWhere(eventId, claimToken))
    .returning();

  return updated;
}

function deliveryClaimWhere(eventId: string, claimToken?: string | null) {
  return and(
    eq(deliveryEvents.id, eventId),
    claimToken ? eq(deliveryEvents.claimToken, claimToken) : undefined
  );
}

function buildWebhookHeaders(body: string, secret: string | null) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (secret) {
    headers["x-sentrovia-signature"] = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");
  }

  return headers;
}

function serializeDelivery(row: typeof deliveryEvents.$inferSelect): DeliveryHistoryRecord {
  return {
    id: row.id,
    monitorId: row.monitorId,
    channel: row.channel as DeliveryHistoryRecord["channel"],
    kind: row.kind,
    destination: row.destination,
    status: row.status,
    attempts: row.attempts,
    responseCode: row.responseCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    nextRetryAt: row.nextRetryAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    deadLetteredAt: row.deadLetteredAt?.toISOString() ?? null,
    payload: safeJsonParse(row.payloadJson),
  };
}

function isRetryableHttpStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRetryableDeliveryError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  return !["EAUTH", "EENVELOPE", "EINVALID", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(code);
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected delivery failure.";
}

type StoredEmailAttachment = {
  filename?: string;
  contentType?: string;
  contentDisposition?: "attachment" | "inline";
  cid?: string;
  content: string;
  encoding: "utf8" | "base64";
};

function serializeEmailAttachments(attachments: Mail.Attachment[] | undefined) {
  if (!attachments?.length) {
    return undefined;
  }

  return attachments.flatMap((attachment): StoredEmailAttachment[] => {
    const content = attachment.content;
    if (typeof content !== "string" && !Buffer.isBuffer(content)) {
      return [];
    }

    return [{
      filename: typeof attachment.filename === "string" ? attachment.filename : undefined,
      contentType: attachment.contentType,
      contentDisposition: attachment.contentDisposition === "inline" ? "inline" : "attachment",
      cid: typeof attachment.cid === "string" ? attachment.cid : undefined,
      content: Buffer.isBuffer(content) ? content.toString("base64") : content,
      encoding: Buffer.isBuffer(content) ? "base64" : "utf8",
    }];
  });
}

function deserializeEmailAttachments(value: unknown): Mail.Attachment[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const attachments = value.flatMap((item): Mail.Attachment[] => {
    if (!isStoredEmailAttachment(item)) {
      return [];
    }

    return [{
      filename: typeof item.filename === "string" ? item.filename : undefined,
      contentType: typeof item.contentType === "string" ? item.contentType : undefined,
      contentDisposition: item.contentDisposition === "inline" ? "inline" : "attachment",
      cid: typeof item.cid === "string" ? item.cid : undefined,
      content: item.encoding === "base64" ? Buffer.from(item.content, "base64") : item.content,
    }];
  });

  return attachments.length > 0 ? attachments : undefined;
}

function isStoredEmailAttachment(value: unknown): value is StoredEmailAttachment {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<StoredEmailAttachment>;
  return typeof candidate.content === "string"
    && (candidate.encoding === "utf8" || candidate.encoding === "base64");
}

function readPayloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

export { readLimitedResponseText };
