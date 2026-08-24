import { sql } from "@/lib/db";
import { getAppEncryptionSecret, getAuthSecret } from "@/lib/env";

export const runtime = "nodejs";

const HEALTH_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "text/plain; charset=utf-8",
};

export async function GET() {
  try {
    getAuthSecret();
    getAppEncryptionSecret();
    await sql`select 1`;
    return new Response("ok", { headers: HEALTH_HEADERS });
  } catch {
    return new Response("unavailable", { status: 503, headers: HEALTH_HEADERS });
  }
}
