import type Mail from "nodemailer/lib/mailer";
import {
  buildDeliveryAbortSignal,
  readLimitedResponseText,
  safeJsonParse,
} from "@/lib/delivery/transport-utils";

const TELEGRAM_MESSAGE_LIMIT = 4096;
const TELEGRAM_TRUNCATION_SUFFIX = "\n\n...[truncated]";
const TELEGRAM_PHOTO_CAPTION_LIMIT = 1024;

export function toTelegramErrorMessage(error: unknown, botToken: string) {
  const message = toMessage(error);
  return botToken ? message.replaceAll(botToken, "[redacted]") : message;
}

export function postTelegramMessage(botToken: string, chatId: string, body: string) {
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

export async function readTelegramResponseFailure(response: Response) {
  const responseBody = await readLimitedResponseText(response);
  return parseTelegramResponseFailure(responseBody, response.status, response.ok);
}

function parseTelegramResponseFailure(body: string, responseStatus: number, responseOk: boolean) {
  const parsed = safeJsonParse(body);
  const apiFailed = parsed.ok === false;
  if (responseOk && !apiFailed) {
    return null;
  }

  const apiStatus = typeof parsed.error_code === "number" ? parsed.error_code : responseStatus;
  const description = typeof parsed.description === "string" ? parsed.description : "";
  return {
    status: apiStatus,
    message: description || body || "Telegram delivery failed.",
  };
}

export async function resolveTelegramPhoto(input: {
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

export async function sendTelegramPhotoWithoutBlockingMessage(
  botToken: string,
  chatId: string,
  body: string,
  photo: Mail.Attachment
) {
  try {
    const response = await postTelegramPhoto(botToken, chatId, body, photo);
    const responseBody = await readLimitedResponseText(response);
    const failure = parseTelegramResponseFailure(responseBody, response.status, response.ok);
    if (failure) {
      console.warn(`[sentrovia] Telegram screenshot skipped: ${failure.message}`);
    }
  } catch (error) {
    console.warn(`[sentrovia] Telegram screenshot skipped: ${toTelegramErrorMessage(error, botToken)}`);
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

export function normalizeTelegramMessage(body: string) {
  if (body.length <= TELEGRAM_MESSAGE_LIMIT) {
    return body;
  }

  const availableLength = TELEGRAM_MESSAGE_LIMIT - TELEGRAM_TRUNCATION_SUFFIX.length;
  return `${body.slice(0, availableLength).trimEnd()}${TELEGRAM_TRUNCATION_SUFFIX}`;
}


function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected delivery failure.";
}
