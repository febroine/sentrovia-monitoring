import { AuthError } from "@/lib/auth/errors";

const EMPTY_JSON_BODY_ERROR = "Invalid JSON request body.";

export async function readJsonBody(request: Request, maxBytes: number) {
  const body = await readRequestBodyText(request, maxBytes);

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new SyntaxError(EMPTY_JSON_BODY_ERROR);
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
