import crypto from "node:crypto";
import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { deliveryEvents, webhookEndpoints } from "@/lib/db/schema";
import { sanitizeMonitorUrlForDisplay } from "@/lib/monitors/targets";
import { decryptValue, encryptValue } from "@/lib/security/encryption";
import { assertSafeWebhookUrl, isWebhookSafetyError } from "@/lib/security/webhook-safety";
import { getSettings } from "@/lib/settings/service";
import { getSmtpSettings } from "@/lib/settings/smtp";
import type {
  DeliveryHistoryRecord,
  DeliveryHistoryDeletionRange,
  DeliveryKind,
  DeliveryOverview,
  DeliveryTestInput,
  WebhookSettingsInput,
} from "@/lib/delivery/types";

const DELIVERY_HISTORY_PAGE_SIZE = 10;
const MAX_WEBHOOK_ATTEMPTS = 5;
const WEBHOOK_RETRY_DELAY_MS = 5 * 60 * 1000;
const DELIVERY_REQUEST_TIMEOUT_MS = 15_000;
const DELIVERY_RESPONSE_BODY_LIMIT_BYTES = 4_000;
const TELEGRAM_MESSAGE_LIMIT = 4096;
const TELEGRAM_TRUNCATION_SUFFIX = "\n\n...[truncated]";
const TELEGRAM_PHOTO_CAPTION_LIMIT = 1024;
const OUTBOUND_WEBHOOK_REDIRECT_MODE = "manual";
const WEBHOOK_CLAIM_LEASE_MS = 2 * 60 * 1000;
const WEBHOOK_QUEUE_STATUSES = ["pending", "retrying", "processing"];
const DELIVERY_HISTORY_DELETABLE_STATUSES = ["delivered", "failed"];
const WEBHOOK_RETRY_BATCH_SIZE = 5;

export async function getDeliveryOverview(userId: string, requestedPage = 1): Promise<DeliveryOverview> {
  const [endpoint, totalRows, summaryRows] = await Promise.all([
    getWebhookEndpoint(userId),
    db
      .select({ total: count() })
      .from(deliveryEvents)
      .where(eq(deliveryEvents.userId, userId)),
    db
      .select({
        delivered: sql<number>`count(*) filter (where ${deliveryEvents.status} = 'delivered')::integer`,
        failed: sql<number>`count(*) filter (where ${deliveryEvents.status} = 'failed')::integer`,
        retrying: sql<number>`count(*) filter (where ${deliveryEvents.status} = 'retrying')::integer`,
        pendingWebhookRetries: sql<number>`count(*) filter (where ${deliveryEvents.channel} = 'webhook' and ${deliveryEvents.status} in ('pending', 'retrying', 'processing'))::integer`,
      })
      .from(deliveryEvents)
      .where(eq(deliveryEvents.userId, userId)),
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
  const summary = summaryRows[0];

  return {
    webhook: endpoint
      ? {
          url: endpoint.url,
          isActive: endpoint.isActive,
          secretConfigured: Boolean(decryptValue(endpoint.secretEncrypted)),
        }
      : null,
    history,
    summary: {
      delivered: Number(summary?.delivered ?? 0),
      failed: Number(summary?.failed ?? 0),
      retrying: Number(summary?.retrying ?? 0),
      pendingWebhookRetries: Number(summary?.pendingWebhookRetries ?? 0),
    },
    pagination: { page, pageSize: DELIVERY_HISTORY_PAGE_SIZE, totalItems, totalPages },
  };
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
    url: safeUrl,
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
  destinationOverride?: string | null;
  subject: string;
  textBody: string;
  htmlBody: string;
  attachments?: Mail.Attachment[];
  buildAttachments?: () => Promise<Mail.Attachment[] | undefined>;
}) {
  const smtp = await getSmtpSettings(input.userId);
  const destination = input.destinationOverride || smtp?.defaultToEmail || "";
  const event = await createDeliveryEvent(input.userId, "email", input.kind, destination, {
    subject: input.subject,
    textBody: input.textBody,
  });

  if (!smtp || !smtp.fromEmail || !destination) {
    return markDeliveryFailed(event.id, null, "SMTP configuration is incomplete for email delivery.");
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: smtp.requireTls,
      auth: smtp.username ? { user: smtp.username, pass: smtp.password } : undefined,
      tls: { rejectUnauthorized: !smtp.insecureSkipVerify },
      connectionTimeout: DELIVERY_REQUEST_TIMEOUT_MS,
      greetingTimeout: DELIVERY_REQUEST_TIMEOUT_MS,
      socketTimeout: DELIVERY_REQUEST_TIMEOUT_MS,
    });

    const attachments = await resolveEmailAttachments(input);
    await transporter.sendMail(buildEmailMessage({ ...input, attachments }, smtp.fromEmail, destination));

    return markDeliveryDelivered(event.id, 250);
  } catch (error) {
    return markDeliveryFailed(event.id, null, toMessage(error));
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
  });

  if (!botToken || !chatId) {
    return markDeliveryFailed(event.id, null, "Telegram bot token or chat id is missing.");
  }

  if (!body.trim()) {
    return markDeliveryFailed(event.id, null, "Telegram message body is empty.");
  }

  try {
    const response = await postTelegramMessage(botToken, chatId, body);

    if (!response.ok) {
      const responseBody = await readLimitedResponseText(response);
      return markDeliveryFailed(event.id, response.status, responseBody || "Telegram delivery failed.");
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
    return markDeliveryFailed(event.id, null, toMessage(error));
  }
}

export async function sendWebhookDelivery(
  userId: string,
  kind: DeliveryKind,
  payload: Record<string, unknown>
) {
  const endpoint = await getWebhookEndpoint(userId);
  if (!endpoint?.isActive && kind !== "test") {
    return null;
  }

  const event = await createDeliveryEvent(
    userId,
    "webhook",
    kind,
    endpoint?.url ?? "Webhook not configured",
    payload
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
  message: string
) {
  const settings = await getSettings(userId);
  const destination = settings?.notifications.discordWebhookUrl;
  const enabled = settings?.notifications.discordEnabled;
  const event = await createDeliveryEvent(userId, channel, kind, destination || `${channel} not configured`, {
    text: message,
  });

  if (!enabled || !destination) {
    return markDeliveryFailed(event.id, null, `${channel} webhook is not configured or inactive.`);
  }

  try {
    const safeDestination = await assertSafeWebhookUrl(destination);
    const body = { content: message };
    const response = await fetch(safeDestination, {
      method: "POST",
      redirect: OUTBOUND_WEBHOOK_REDIRECT_MODE,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: buildDeliveryAbortSignal(),
    });

    if (!response.ok) {
      const responseBody = await readLimitedResponseText(response);
      return markDeliveryFailed(event.id, response.status, responseBody || `${channel} delivery failed.`);
    }

    return markDeliveryDelivered(event.id, response.status);
  } catch (error) {
    return markDeliveryFailed(event.id, null, toMessage(error));
  }
}

export async function retryWebhookQueue(userId: string) {
  const [endpoint, dueEvents] = await Promise.all([
    getWebhookEndpoint(userId),
    db
      .select()
      .from(deliveryEvents)
      .where(
        and(
          eq(deliveryEvents.userId, userId),
          eq(deliveryEvents.channel, "webhook"),
          inArray(deliveryEvents.status, WEBHOOK_QUEUE_STATUSES),
          or(isNull(deliveryEvents.claimExpiresAt), lte(deliveryEvents.claimExpiresAt, new Date())),
          or(isNull(deliveryEvents.nextRetryAt), lte(deliveryEvents.nextRetryAt, new Date()))
        )
      )
      .orderBy(asc(deliveryEvents.createdAt))
      .limit(WEBHOOK_RETRY_BATCH_SIZE),
  ]);

  if (!endpoint?.isActive) {
    return { processed: 0 };
  }

  let processed = 0;

  for (const item of dueEvents) {
    const payload = safeJsonParse(item.payloadJson);
    const result = await attemptWebhookDelivery(
      item.id,
      endpoint.url,
      decryptValue(endpoint.secretEncrypted),
      payload
    );
    if (result) {
      processed += 1;
    }
  }

  return { processed };
}

export async function retryWebhookQueueForAllUsers() {
  const now = new Date();
  const activeEndpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.isActive, true));

  if (activeEndpoints.length === 0) {
    return { processed: 0 };
  }

  const endpointByUserId = new Map(activeEndpoints.map((endpoint) => [endpoint.userId, endpoint]));
  const dueEvents = await db
    .select()
    .from(deliveryEvents)
    .where(
      and(
        eq(deliveryEvents.channel, "webhook"),
        inArray(deliveryEvents.userId, [...endpointByUserId.keys()]),
        inArray(deliveryEvents.status, WEBHOOK_QUEUE_STATUSES),
        or(isNull(deliveryEvents.claimExpiresAt), lte(deliveryEvents.claimExpiresAt, now)),
        or(isNull(deliveryEvents.nextRetryAt), lte(deliveryEvents.nextRetryAt, now))
      )
    )
    .orderBy(asc(deliveryEvents.createdAt))
    .limit(WEBHOOK_RETRY_BATCH_SIZE);
  let processed = 0;

  for (const item of dueEvents) {
    const endpoint = endpointByUserId.get(item.userId);
    if (!endpoint) {
      continue;
    }

    const result = await attemptWebhookDelivery(
      item.id,
      endpoint.url,
      decryptValue(endpoint.secretEncrypted),
      safeJsonParse(item.payloadJson)
    );
    if (result) {
      processed += 1;
    }
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

  return endpoint ?? null;
}

async function createDeliveryEvent(
  userId: string,
  channel: "email" | "telegram" | "webhook" | "discord",
  kind: DeliveryKind,
  destination: string,
  payload: Record<string, unknown>
) {
  const [created] = await db
    .insert(deliveryEvents)
    .values({
      userId,
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
  const current = await claimWebhookDelivery(eventId);
  if (!current) {
    return null;
  }

  try {
    const safeEndpointUrl = await assertSafeWebhookUrl(endpointUrl);
    const body = JSON.stringify(payload);
    const response = await fetch(safeEndpointUrl, {
      method: "POST",
      redirect: OUTBOUND_WEBHOOK_REDIRECT_MODE,
      headers: buildWebhookHeaders(body, secret),
      body,
      signal: buildDeliveryAbortSignal(),
    });

    if (response.ok) {
      return markDeliveryDelivered(eventId, response.status, current.attempts + 1, current.claimToken);
    }

    return markDeliveryRetryable(
      eventId,
      current.attempts + 1,
      response.status,
      await readLimitedResponseText(response),
      current.claimToken
    );
  } catch (error) {
    if (isWebhookSafetyError(error)) {
      return markDeliveryFailed(eventId, null, toMessage(error), current.attempts + 1, current.claimToken);
    }

    return markDeliveryRetryable(
      eventId,
      current.attempts + 1,
      null,
      toMessage(error),
      current.claimToken
    );
  }
}

async function claimWebhookDelivery(eventId: string) {
  const now = new Date();
  const claimToken = crypto.randomUUID();
  const [claimed] = await db
    .update(deliveryEvents)
    .set({
      status: "processing",
      claimToken,
      claimExpiresAt: new Date(now.getTime() + WEBHOOK_CLAIM_LEASE_MS),
    })
    .where(
      and(
        eq(deliveryEvents.id, eventId),
        eq(deliveryEvents.channel, "webhook"),
        inArray(deliveryEvents.status, WEBHOOK_QUEUE_STATUSES),
        or(isNull(deliveryEvents.claimExpiresAt), lte(deliveryEvents.claimExpiresAt, now)),
        or(isNull(deliveryEvents.nextRetryAt), lte(deliveryEvents.nextRetryAt, now))
      )
    )
    .returning();

  return claimed ?? null;
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
  const exhausted = attempts >= MAX_WEBHOOK_ATTEMPTS;
  const [updated] = await db
    .update(deliveryEvents)
    .set({
      status: exhausted ? "failed" : "retrying",
      attempts,
      responseCode,
      errorMessage: errorMessage.slice(0, 1000),
      lastAttemptAt: new Date(),
      nextRetryAt: exhausted ? null : new Date(Date.now() + WEBHOOK_RETRY_DELAY_MS),
      claimToken: null,
      claimExpiresAt: null,
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

export async function readLimitedResponseText(
  response: Response,
  maxBytes = DELIVERY_RESPONSE_BODY_LIMIT_BYTES
) {
  if (!response.body || maxBytes <= 0) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  let truncated = false;

  try {
    while (receivedBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) {
        break;
      }

      const remainingBytes = maxBytes - receivedBytes;
      if (value.byteLength > remainingBytes) {
        chunks.push(value.slice(0, remainingBytes));
        receivedBytes = maxBytes;
        truncated = true;
        await reader.cancel().catch(() => undefined);
        break;
      }

      if (value.byteLength === remainingBytes) {
        chunks.push(value);
        receivedBytes = maxBytes;
        const next = await reader.read();
        truncated = !next.done;
        await reader.cancel().catch(() => undefined);
        break;
      }

      chunks.push(value);
      receivedBytes += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const text = new TextDecoder().decode(Buffer.concat(chunks));
  return truncated ? `${text}... [truncated]` : text;
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
    payload: safeJsonParse(row.payloadJson),
  };
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return { raw: value };
  }
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected delivery failure.";
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function postTelegramMessage(botToken: string, chatId: string, body: string) {
  return fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: buildDeliveryAbortSignal(),
    body: JSON.stringify({
      chat_id: chatId,
      text: body,
      disable_web_page_preview: false,
    }),
  });
}

async function resolveTelegramPhoto(input: {
  photo?: Mail.Attachment;
  buildPhoto?: () => Promise<Mail.Attachment | null | undefined>;
}) {
  if (input.photo) {
    return input.photo;
  }

  if (!input.buildPhoto) {
    return null;
  }

  try {
    return (await input.buildPhoto()) ?? null;
  } catch (error) {
    console.warn(`[sentrovia] Telegram screenshot skipped: ${toMessage(error)}`);
    return null;
  }
}

async function sendTelegramPhotoWithoutBlockingMessage(
  botToken: string,
  chatId: string,
  body: string,
  photo: Mail.Attachment
) {
  try {
    const response = await postTelegramPhoto(botToken, chatId, body, photo);
    if (!response.ok) {
      console.warn(`[sentrovia] Telegram screenshot skipped: ${await readLimitedResponseText(response)}`);
    }
  } catch (error) {
    console.warn(`[sentrovia] Telegram screenshot skipped: ${toMessage(error)}`);
  }
}

function postTelegramPhoto(botToken: string, chatId: string, body: string, photo: Mail.Attachment) {
  const content = getTelegramPhotoContent(photo);
  if (!content) {
    throw new Error("Telegram screenshot content is not available.");
  }

  const formData = new FormData();
  formData.set("chat_id", chatId);
  formData.set("caption", truncateTelegramCaption(body));
  formData.set("photo", buildTelegramPhotoBlob(content, photo.contentType), getTelegramPhotoFilename(photo));

  return fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: "POST",
    signal: buildDeliveryAbortSignal(),
    body: formData,
  });
}

function getTelegramPhotoContent(photo: Mail.Attachment) {
  const content = photo.content;
  if (typeof content === "string" || Buffer.isBuffer(content) || content instanceof Uint8Array) {
    return content;
  }

  return null;
}

function getTelegramPhotoFilename(photo: Mail.Attachment) {
  return typeof photo.filename === "string" && photo.filename.trim().length > 0
    ? photo.filename
    : "sentrovia-screenshot.jpg";
}

function buildTelegramPhotoBlob(content: string | Buffer | Uint8Array, contentType?: string) {
  const blobPart = typeof content === "string" ? content : new Uint8Array(content);
  return new Blob([blobPart], { type: contentType || "image/jpeg" });
}

function truncateTelegramCaption(body: string) {
  if (body.length <= TELEGRAM_PHOTO_CAPTION_LIMIT) {
    return body;
  }

  const suffix = "\n...[truncated]";
  return `${body.slice(0, TELEGRAM_PHOTO_CAPTION_LIMIT - suffix.length).trimEnd()}${suffix}`;
}

function normalizeTelegramMessage(body: string) {
  if (body.length <= TELEGRAM_MESSAGE_LIMIT) {
    return body;
  }

  const availableLength = TELEGRAM_MESSAGE_LIMIT - TELEGRAM_TRUNCATION_SUFFIX.length;
  return `${body.slice(0, availableLength).trimEnd()}${TELEGRAM_TRUNCATION_SUFFIX}`;
}

function buildDeliveryAbortSignal() {
  const timeout = (AbortSignal as typeof AbortSignal & {
    timeout?: (milliseconds: number) => AbortSignal;
  }).timeout;

  if (timeout) {
    return timeout(DELIVERY_REQUEST_TIMEOUT_MS);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), DELIVERY_REQUEST_TIMEOUT_MS);
  return controller.signal;
}
