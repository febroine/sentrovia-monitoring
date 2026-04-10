export type DeliveryChannel = "email" | "telegram" | "webhook" | "discord";
export type DeliveryKind =
  | "failure"
  | "recovery"
  | "latency"
  | "ssl-expiry"
  | "status-change"
  | "check"
  | "report"
  | "test";
export type DeliveryStatus = "pending" | "retrying" | "delivered" | "failed";

export interface DeliveryHistoryRecord {
  id: string;
  channel: DeliveryChannel;
  kind: DeliveryKind | string;
  destination: string;
  status: DeliveryStatus | string;
  attempts: number;
  responseCode: number | null;
  errorMessage: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  payload: Record<string, unknown> | null;
}

export interface DeliveryOverview {
  webhook: {
    url: string;
    isActive: boolean;
    secretConfigured: boolean;
  } | null;
  history: DeliveryHistoryRecord[];
  summary: {
    delivered: number;
    failed: number;
    retrying: number;
    pendingWebhookRetries: number;
  };
}

export interface WebhookSettingsInput {
  url: string;
  secret: string;
  isActive: boolean;
}

export interface DeliveryTestInput {
  channel: "email" | "telegram" | "webhook" | "discord";
  destination?: string;
  botToken?: string;
  chatId?: string;
  message?: string;
}
