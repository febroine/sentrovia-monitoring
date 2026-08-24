import http from "node:http";
import https from "node:https";
import { AuthError } from "@/lib/auth/errors";
import {
  assertPublicNetworkTarget,
  createPinnedLookup,
  resolvePublicNetworkTarget,
} from "@/lib/security/public-network-target";

const WEBHOOK_PUBLIC_TARGET_ERROR = "Webhook targets must point to a public webhook endpoint.";
const WEBHOOK_RESPONSE_LIMIT_BYTES = 100_000;

type SafeWebhookRequest = {
  body: string;
  headers: Record<string, string>;
  signal?: AbortSignal;
};

export async function assertSafeWebhookUrl(value: string) {
  const parsed = parseWebhookUrl(value);
  await assertPublicNetworkTarget(parsed.hostname, WEBHOOK_PUBLIC_TARGET_ERROR);
  return parsed.toString();
}

export async function postSafeWebhook(value: string, options: SafeWebhookRequest) {
  const parsed = parseWebhookUrl(value);
  const resolvedTarget = await resolvePublicNetworkTarget(
    parsed.hostname,
    WEBHOOK_PUBLIC_TARGET_ERROR
  );

  return new Promise<Response>((resolve, reject) => {
    const transport = parsed.protocol === "https:" ? https : http;
    const request = transport.request(parsed, {
      method: "POST",
      headers: options.headers,
      lookup: createPinnedLookup(resolvedTarget),
      signal: options.signal,
    }, (response) => {
      const chunks: Buffer[] = [];
      let capturedBytes = 0;

      response.on("data", (chunk: Buffer | string) => {
        if (capturedBytes >= WEBHOOK_RESPONSE_LIMIT_BYTES) {
          return;
        }

        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = WEBHOOK_RESPONSE_LIMIT_BYTES - capturedBytes;
        chunks.push(buffer.subarray(0, remaining));
        capturedBytes += Math.min(buffer.length, remaining);
      });
      response.once("end", () => {
        const status = response.statusCode ?? 500;
        const body = status === 204 || status === 205 || status === 304
          ? null
          : Buffer.concat(chunks);
        resolve(new Response(body, {
          status,
          headers: toResponseHeaders(response.headers),
        }));
      });
      response.once("error", reject);
    });

    request.once("error", reject);
    request.end(options.body);
  });
}

export function isWebhookSafetyError(error: unknown) {
  return error instanceof AuthError;
}

function parseWebhookUrl(value: string) {
  let parsed: URL;

  try {
    parsed = new URL(value.trim());
  } catch {
    throw new AuthError("Enter a valid public webhook endpoint URL.", 400);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new AuthError("Webhook targets must use http or https.", 400);
  }

  if (parsed.username || parsed.password) {
    throw new AuthError("Webhook URLs cannot include inline credentials.", 400);
  }

  return parsed;
}

function toResponseHeaders(headers: http.IncomingHttpHeaders) {
  const result = new Headers();

  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      value.forEach((item) => result.append(name, item));
    } else if (value !== undefined) {
      result.set(name, value);
    }
  }

  return result;
}
