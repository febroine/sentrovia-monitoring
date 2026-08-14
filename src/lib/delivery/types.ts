type DeliveryChannel = "email" | "telegram" | "webhook" | "discord";
export type DeliveryKind =
  | "failure"
  | "recovery"
  | "latency"
  | "ssl-expiry"
  | "status-change"
  | "downtime-reminder"
  | "check"
  | "report"
  | "test";
type DeliveryStatus = "pending" | "retrying" | "processing" | "delivered" | "failed";

export interface DeliveryHistoryRecord {
  id: string;
  monitorId: string | null;
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
  deadLetteredAt: string | null;
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
    pendingRetries: number;
    deadLettered: number;
  };
  channelHealth: DeliveryChannelHealth[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export type DeliveryChannelHealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface DeliveryChannelHealth {
  channel: DeliveryChannel;
  totalAttempts: number;
  delivered: number;
  failed: number;
  retrying: number;
  errorRatePct: number | null;
  status: DeliveryChannelHealthStatus;
  lastAttemptAt: string | null;
  lastErrorMessage: string | null;
}

export interface DeliveryHistoryDeletionRange {
  from: Date;
  toExclusive: Date;
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
