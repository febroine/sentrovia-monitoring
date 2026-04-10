import crypto from "node:crypto";
import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { deliveryEvents, webhookEndpoints } from "@/lib/db/schema";
import { decryptValue, encryptValue } from "@/lib/security/encryption";
import { getSettings } from "@/lib/settings/service";
import { getSmtpSettings } from "@/lib/settings/smtp";
import type {
  DeliveryHistoryRecord,
  DeliveryKind,
  DeliveryOverview,
  DeliveryTestInput,
  WebhookSettingsInput,
} from "@/lib/delivery/types";

const HISTORY_LIMIT = 40;
const MAX_WEBHOOK_ATTEMPTS = 5;
const WEBHOOK_RETRY_DELAY_MS = 5 * 60 * 1000;

export async function getDeliveryOverview(userId: string): Promise<DeliveryOverview> {
  const [endpoint, historyRows] = await Promise.all([
    getWebhookEndpoint(userId),
    db
      .select()
      .from(deliveryEvents)
      .where(eq(deliveryEvents.userId, userId))
      .orderBy(desc(deliveryEvents.createdAt))
      .limit(HISTORY_LIMIT),
  ]);

  const history = historyRows.map(serializeDelivery);

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
      delivered: historyRows.filter((item) => item.status === "delivered").length,
      failed: historyRows.filter((item) => item.status === "failed").length,
      retrying: historyRows.filter((item) => item.status === "retrying").length,
      pendingWebhookRetries: historyRows.filter(
        (item) => item.channel === "webhook" && item.status !== "delivered"
      ).length,
    },
  };
}

export async function upsertWebhookSettings(userId: string, input: WebhookSettingsInput) {
  const [existing] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.userId, userId));
  const secretEncrypted = input.secret.trim()
    ? encryptValue(input.secret.trim())
    : existing?.secretEncrypted ?? null;

  const values = {
    userId,
    url: input.url.trim(),
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

  if (input.channel === "slack") {
    return sendChannelWebhookDelivery(userId, "slack", "test", message);
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
    });

    await transporter.sendMail(buildEmailMessage(input, smtp.fromEmail, destination));

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

export async function sendTelegramDelivery(input: {
  userId: string;
  kind: DeliveryKind;
  botToken: string;
  chatId: string;
  body: string;
}) {
  const destination = input.chatId;
  const event = await createDeliveryEvent(input.userId, "telegram", input.kind, destination, {
    text: input.body,
  });

  if (!input.botToken || !input.chatId) {
    return markDeliveryFailed(event.id, null, "Telegram bot token or chat id is missing.");
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${input.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: input.chatId,
        text: input.body,
        disable_web_page_preview: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return markDeliveryFailed(event.id, response.status, body || "Telegram delivery failed.");
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
  channel: "slack" | "discord",
  kind: DeliveryKind,
  message: string
) {
  const settings = await getSettings(userId);
  const destination =
    channel === "slack" ? settings?.notifications.slackWebhookUrl : settings?.notifications.discordWebhookUrl;
  const enabled =
    channel === "slack" ? settings?.notifications.slackEnabled : settings?.notifications.discordEnabled;
  const event = await createDeliveryEvent(userId, channel, kind, destination || `${channel} not configured`, {
    text: message,
  });

  if (!enabled || !destination) {
    return markDeliveryFailed(event.id, null, `${channel} webhook is not configured or inactive.`);
  }

  try {
    const body =
      channel === "slack"
        ? { text: message }
        : { content: message };
    const response = await fetch(destination, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return markDeliveryFailed(event.id, response.status, (await response.text()) || `${channel} delivery failed.`);
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
          inArray(deliveryEvents.status, ["pending", "retrying"]),
          or(isNull(deliveryEvents.nextRetryAt), lte(deliveryEvents.nextRetryAt, new Date()))
        )
      )
      .orderBy(desc(deliveryEvents.createdAt))
      .limit(25),
  ]);

  if (!endpoint?.isActive) {
    return { processed: 0 };
  }

  let processed = 0;

  for (const item of dueEvents) {
    const payload = safeJsonParse(item.payloadJson);
    await attemptWebhookDelivery(item.id, endpoint.url, decryptValue(endpoint.secretEncrypted), payload);
    processed += 1;
  }

  return { processed };
}

export async function retryWebhookQueueForAllUsers() {
  const userRows = await db
    .select({ userId: deliveryEvents.userId })
    .from(deliveryEvents)
    .where(
      and(
        eq(deliveryEvents.channel, "webhook"),
        inArray(deliveryEvents.status, ["pending", "retrying"]),
        or(isNull(deliveryEvents.nextRetryAt), lte(deliveryEvents.nextRetryAt, new Date()))
      )
    );
  const userIds = Array.from(new Set(userRows.map((row) => row.userId)));

  for (const userId of userIds) {
    await retryWebhookQueue(userId);
  }
}

export async function buildNotificationWebhookPayload(input: {
  userId: string;
  kind: DeliveryKind;
  monitorName: string;
  url: string;
  status: string;
  statusCode: number | null;
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
      url: input.url,
      status: input.status,
      statusCode: input.statusCode,
    },
    message: input.message,
    rca: {
      title: input.rcaTitle,
      summary: input.rcaSummary,
    },
    checkedAt: input.checkedAt.toISOString(),
  };
}

async function getWebhookEndpoint(userId: string) {
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.userId, userId));

  return endpoint ?? null;
}

async function createDeliveryEvent(
  userId: string,
  channel: "email" | "telegram" | "webhook" | "slack" | "discord",
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
  const [current] = await db.select().from(deliveryEvents).where(eq(deliveryEvents.id, eventId));
  if (!current) {
    return null;
  }

  try {
    const body = JSON.stringify(payload);
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: buildWebhookHeaders(body, secret),
      body,
    });

    if (response.ok) {
      return markDeliveryDelivered(eventId, response.status, current.attempts + 1);
    }

    return markDeliveryRetryable(eventId, current.attempts + 1, response.status, await response.text());
  } catch (error) {
    return markDeliveryRetryable(eventId, current.attempts + 1, null, toMessage(error));
  }
}

async function markDeliveryDelivered(eventId: string, responseCode: number | null, attempts = 1) {
  const [updated] = await db
    .update(deliveryEvents)
    .set({
      status: "delivered",
      attempts,
      responseCode,
      errorMessage: null,
      lastAttemptAt: new Date(),
      nextRetryAt: null,
      deliveredAt: new Date(),
    })
    .where(eq(deliveryEvents.id, eventId))
    .returning();

  return updated;
}

async function markDeliveryRetryable(
  eventId: string,
  attempts: number,
  responseCode: number | null,
  errorMessage: string
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
    })
    .where(eq(deliveryEvents.id, eventId))
    .returning();

  return updated;
}

async function markDeliveryFailed(eventId: string, responseCode: number | null, errorMessage: string) {
  const [updated] = await db
    .update(deliveryEvents)
    .set({
      status: "failed",
      attempts: 1,
      responseCode,
      errorMessage: errorMessage.slice(0, 1000),
      lastAttemptAt: new Date(),
      nextRetryAt: null,
    })
    .where(eq(deliveryEvents.id, eventId))
    .returning();

  return updated;
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
