import { AuthError } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/session";

export async function requireAdminSession() {
  const session = await getSession();

  if (!session) {
    throw new AuthError("Unauthorized", 401);
  }

  if (session.role !== "admin") {
    throw new AuthError("Admin access required.", 403);
  }

  return session;
}
