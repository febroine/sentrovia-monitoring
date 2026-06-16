import { AuthError } from "@/lib/auth/errors";
import { assertPublicNetworkTarget } from "@/lib/security/public-network-target";

const WEBHOOK_PUBLIC_TARGET_ERROR = "Webhook targets must point to a public webhook endpoint.";

export async function assertSafeWebhookUrl(value: string) {
  const parsed = parseWebhookUrl(value);
  await assertPublicNetworkTarget(parsed.hostname, WEBHOOK_PUBLIC_TARGET_ERROR);
  return parsed.toString();
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
