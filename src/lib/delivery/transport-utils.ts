export const DELIVERY_REQUEST_TIMEOUT_MS = 15_000;
const DELIVERY_RESPONSE_BODY_LIMIT_BYTES = 4_000;

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

export function buildDeliveryAbortSignal() {
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

export function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return { raw: value };
  }
}
