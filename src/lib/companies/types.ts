export interface CompanyRecord {
  id: string;
  name: string;
  description: string | null;
  notificationEmailRecipients: string[];
  telegramBotToken: string;
  telegramBotTokenConfigured: boolean;
  telegramChatId: string;
  isActive: boolean;
  createdAt: string;
  monitorsCount: number;
  activeMonitors: number;
}

export interface CompanyPayload {
  name: string;
  description: string;
  notificationEmailRecipients: string;
  telegramBotToken: string;
  telegramBotTokenConfigured: boolean;
  telegramChatId: string;
  isActive: boolean;
}

export const DEFAULT_COMPANY_FORM: CompanyPayload = {
  name: "",
  description: "",
  notificationEmailRecipients: "",
  telegramBotToken: "",
  telegramBotTokenConfigured: false,
  telegramChatId: "",
  isActive: true,
};
