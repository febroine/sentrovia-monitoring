export interface MemberRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string | null;
  role: "admin" | "member";
  username: string | null;
  organization: string | null;
  jobTitle: string | null;
  createdAt: string;
}
