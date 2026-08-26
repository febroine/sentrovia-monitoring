export type PublicStatusPageRecord = {
  id: string;
  companyId: string | null;
  companyName: string | null;
  companyAvailable: boolean;
  slug: string;
  title: string;
  summary: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};
