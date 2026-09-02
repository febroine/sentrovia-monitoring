import { AuthError } from "@/lib/auth/errors";

export const USER_ROLES = ["admin", "manager", "operator", "viewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PERMISSIONS = [
  "members.read",
  "members.manage",
  "monitors.manage",
  "maintenance.manage",
  "incidents.manage",
  "companies.manage",
  "delivery.manage",
  "reports.manage",
  "settings.manage",
  "audit.read",
  "worker.manage",
  "backups.manage",
  "private-targets.access",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  admin: new Set(PERMISSIONS),
  manager: new Set([
    "members.read",
    "members.manage",
    "monitors.manage",
    "maintenance.manage",
    "incidents.manage",
    "companies.manage",
    "delivery.manage",
    "reports.manage",
    "settings.manage",
    "audit.read",
  ]),
  operator: new Set([
    "monitors.manage",
    "maintenance.manage",
    "incidents.manage",
    "companies.manage",
    "delivery.manage",
    "reports.manage",
    "settings.manage",
  ]),
  viewer: new Set(),
};

export function normalizeUserRole(value: unknown): UserRole {
  if (value === "admin" || value === "manager" || value === "operator" || value === "viewer") {
    return value;
  }
  return value === "member" ? "operator" : "viewer";
}

export function hasPermission(role: UserRole, permission: Permission) {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function assertPermission(role: UserRole, permission: Permission) {
  if (!hasPermission(role, permission)) {
    throw new AuthError("You do not have permission to perform this action.", 403);
  }
}

export function canAssignRole(actorRole: UserRole, targetRole: UserRole) {
  if (actorRole === "admin") return true;
  return actorRole === "manager" && (targetRole === "operator" || targetRole === "viewer");
}

export function canManageMemberRole(actorRole: UserRole, targetRole: UserRole) {
  if (actorRole === "admin") return true;
  return actorRole === "manager" && targetRole !== "admin" && targetRole !== "manager";
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manager",
  operator: "Operator",
  viewer: "Viewer",
};
