import { AuthError } from "@/lib/auth/errors";
import { assertPermission, type Permission } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    throw new AuthError("Unauthorized", 401);
  }

  return session;
}

export async function requireAdminSession() {
  const session = await requireSession();

  if (session.role !== "admin") {
    throw new AuthError("Admin access required.", 403);
  }

  return session;
}

export async function requireWorkspacePermission(permission: Permission) {
  const session = await requireSession();
  assertPermission(session.role, permission);
  return session;
}
