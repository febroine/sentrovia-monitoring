import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { normalizeUserRole } from "@/lib/auth/permissions";
import type { ProfileSettingsInput } from "@/lib/settings/schemas";
import type { SettingsPayload } from "@/lib/settings/types";

const profileColumns = {
  firstName: users.firstName,
  lastName: users.lastName,
  email: users.email,
  role: users.role,
  department: users.department,
  username: users.username,
  organization: users.organization,
  jobTitle: users.jobTitle,
  phone: users.phone,
};

type ProfileRow = Pick<
  typeof users.$inferSelect,
  | "firstName"
  | "lastName"
  | "email"
  | "role"
  | "department"
  | "username"
  | "organization"
  | "jobTitle"
  | "phone"
>;

export async function getUserProfile(userId: string) {
  const [profile] = await db
    .select(profileColumns)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return profile ? serializeProfile(profile) : null;
}

export async function updateUserProfile(userId: string, input: ProfileSettingsInput) {
  const [profile] = await db
    .update(users)
    .set({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      department: emptyToNull(input.department),
      username: emptyToNull(input.username),
      organization: emptyToNull(input.organization),
      jobTitle: emptyToNull(input.jobTitle),
      phone: emptyToNull(input.phone),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning(profileColumns);

  return profile ? serializeProfile(profile) : null;
}

function serializeProfile(profile: ProfileRow): SettingsPayload["profile"] {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    role: normalizeUserRole(profile.role),
    department: profile.department ?? "",
    username: profile.username ?? "",
    organization: profile.organization ?? "",
    jobTitle: profile.jobTitle ?? "",
    phone: profile.phone ?? "",
  };
}

function emptyToNull(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
