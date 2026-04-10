export interface CompanyRecord {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  monitorsCount: number;
  activeMonitors: number;
}

export interface CompanyPayload {
  name: string;
  description: string;
  isActive: boolean;
}

export const DEFAULT_COMPANY_FORM: CompanyPayload = {
  name: "",
  description: "",
  isActive: true,
};
