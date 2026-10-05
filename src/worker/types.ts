import type { Monitor } from "@/lib/db/schema";
import type { FailureEvidence } from "@/lib/monitors/failure-evidence";
import type { RootCauseAnalysis } from "@/lib/monitoring/rca";
import type { NotificationLanguage } from "@/lib/settings/types";
import type Mail from "nodemailer/lib/mailer";

export type CheckFailureReason =
  | "timeout"
  | "http_status"
  | "dns"
  | "tls"
  | "connection"
  | "assertion"
  | "redirect"
  | "network"
  | "database"
  | "configuration";

export interface CheckResult {
  ok: boolean;
  status: "up" | "down";
  statusCode: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
  failureReason?: CheckFailureReason | null;
  checkedAt: Date;
  sslExpiresAt: Date | null;
  // What a failed HTTP check saw; only set on failures.
  evidence?: FailureEvidence | null;
}

export interface NotificationContext {
  kind: "failure" | "recovery" | "latency" | "ssl-expiry" | "status-change" | "downtime-reminder" | "check";
  message: string;
  monitor: Monitor;
  result: CheckResult;
  rca: RootCauseAnalysis;
  emailAttachments?: Mail.Attachment[];
  // Checked before each channel; false stops the remaining deliveries.
  canDeliver?: () => Promise<boolean>;
  // Receives the alert's resolved notification language so a screenshot banner matches the message.
  buildEmailAttachments?: (language: NotificationLanguage) => Promise<Mail.Attachment[] | undefined>;
}
