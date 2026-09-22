import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, monitorEvents, monitors, users, workspaceMembers } from "@/lib/db/schema";
import { hasPermission, type UserRole } from "@/lib/auth/permissions";
import type { GlobalSearchResult } from "@/lib/search/types";

const RESULT_LIMIT = 5;

export async function searchWorkspace(
  workspaceId: string,
  userId: string,
  role: UserRole,
  query: string
): Promise<GlobalSearchResult[]> {
  const term = query.trim().slice(0, 80);
  if (term.length < 2) return [];
  const pattern = `%${term}%`;

  const monitorPromise = db.select({ id: monitors.id, name: monitors.name, url: monitors.url })
    .from(monitors)
    .where(and(
      eq(monitors.workspaceId, workspaceId),
      isNull(monitors.deletedAt),
      or(ilike(monitors.name, pattern), ilike(monitors.url, pattern))
    ))
    .orderBy(monitors.name)
    .limit(RESULT_LIMIT);

  const companyPromise = db.select({ id: companies.id, name: companies.name, description: companies.description })
    .from(companies)
    .where(and(
      eq(companies.workspaceId, workspaceId),
      isNull(companies.deletedAt),
      or(ilike(companies.name, pattern), ilike(companies.description, pattern))
    ))
    .orderBy(companies.name)
    .limit(RESULT_LIMIT);

  const logPromise = hasPermission(role, "audit.read")
    ? db.select({ id: monitorEvents.id, message: monitorEvents.message, eventType: monitorEvents.eventType, monitorName: monitors.name })
      .from(monitorEvents)
      .innerJoin(monitors, eq(monitorEvents.monitorId, monitors.id))
      .where(and(
        eq(monitorEvents.workspaceId, workspaceId),
        or(ilike(monitorEvents.message, pattern), ilike(monitors.name, pattern))
      ))
      .orderBy(desc(monitorEvents.createdAt))
      .limit(RESULT_LIMIT)
    : Promise.resolve([]);

  const memberCondition = hasPermission(role, "members.read")
    ? eq(workspaceMembers.workspaceId, workspaceId)
    : and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId));
  const memberPromise = db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(and(
      memberCondition,
      or(ilike(users.firstName, pattern), ilike(users.lastName, pattern), ilike(users.email, pattern))
    ))
    .orderBy(users.firstName, users.lastName)
    .limit(RESULT_LIMIT);

  const [monitorRows, companyRows, logRows, memberRows] = await Promise.all([
    monitorPromise,
    companyPromise,
    logPromise,
    memberPromise,
  ]);

  const settings = hasPermission(role, "settings.manage")
    ? [
      { id: "settings-monitoring", title: "Monitoring settings", description: "Defaults, intervals, and check behaviour", href: "/settings#monitoring" },
      { id: "settings-notifications", title: "Notification settings", description: "Email, Telegram, Slack, and delivery defaults", href: "/settings#notifications" },
      { id: "settings-backups", title: "Backup settings", description: "Automatic backups and retention", href: "/settings#backup" },
    ].filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(term.toLowerCase()))
    : [];

  return [
    ...monitorRows.map((item) => ({ id: item.id, type: "monitor" as const, title: item.name, description: item.url, href: `/monitoring?search=${encodeURIComponent(item.name)}`, monitorId: item.id })),
    ...companyRows.map((item) => ({ id: item.id, type: "company" as const, title: item.name, description: item.description ?? "Company", href: `/companies?search=${encodeURIComponent(item.name)}` })),
    ...logRows.map((item) => ({ id: item.id, type: "log" as const, title: item.monitorName, description: item.message ?? item.eventType, href: `/logs?monitorQuery=${encodeURIComponent(item.monitorName)}` })),
    ...memberRows.map((item) => ({ id: item.id, type: "member" as const, title: `${item.firstName} ${item.lastName}`.trim(), description: item.email, href: `/members?search=${encodeURIComponent(item.email)}` })),
    ...settings.map((item) => ({ ...item, type: "setting" as const })),
  ];
}
