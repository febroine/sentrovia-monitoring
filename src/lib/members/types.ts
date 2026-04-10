export interface MemberRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string | null;
  username: string | null;
  organization: string | null;
  jobTitle: string | null;
  createdAt: string;
}
