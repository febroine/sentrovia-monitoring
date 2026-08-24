import type { UserRole } from "@/lib/auth/permissions";

export interface MemberRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string | null;
  role: UserRole;
  username: string | null;
  organization: string | null;
  jobTitle: string | null;
  createdAt: string;
}
