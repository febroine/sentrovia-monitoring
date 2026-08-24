import { AuthError } from "@/lib/auth/errors";
import { env } from "@/lib/env";

const EMPTY_JSON_BODY_ERROR = "Invalid JSON request body.";
export const STANDARD_JSON_BODY_LIMIT_BYTES = 128_000;

export async function readJsonBody(request: Request, maxBytes: number) {
  assertJsonContentType(request);
  assertSameOriginMutation(request);
  const body = await readRequestBodyText(request, maxBytes);

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new SyntaxError(EMPTY_JSON_BODY_ERROR);
  }
}

function assertJsonContentType(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const isJson = contentType === "application/json" || contentType?.endsWith("+json") === true;

  if (!isJson) {
    throw new AuthError("Content-Type must be application/json.", 415);
  }
}

export function assertSameOriginMutation(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AuthError("Cross-site requests are not allowed.", 403);
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return;
  }

  let allowedOrigins: Set<string>;
  let suppliedOrigin: string;
  try {
    allowedOrigins = new Set([
      new URL(request.url).origin,
      new URL(env.appUrl).origin,
    ]);
    suppliedOrigin = new URL(origin).origin;
  } catch {
    throw new AuthError("Request origin is invalid.", 403);
  }

  if (!allowedOrigins.has(suppliedOrigin)) {
    throw new AuthError("Cross-origin requests are not allowed.", 403);
  }
}

async function readRequestBodyText(request: Request, maxBytes: number) {
  assertValidLimit(maxBytes);
  assertContentLengthWithinLimit(request, maxBytes);

  if (!request.body) {
    throw new SyntaxError(EMPTY_JSON_BODY_ERROR);
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let body = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      receivedBytes += value.byteLength;
      if (receivedBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AuthError("Request body is too large.", 413);
      }

      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  return body + decoder.decode();
}

function assertValidLimit(maxBytes: number) {
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("JSON body limit must be a positive integer.");
  }
}

function assertContentLengthWithinLimit(request: Request, maxBytes: number) {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) {
    return;
  }

  const parsed = Number(contentLength);
  if (Number.isFinite(parsed) && parsed > maxBytes) {
    throw new AuthError("Request body is too large.", 413);
  }
}
