import type { Monitor } from "@/lib/db/schema";
import type { RootCauseAnalysis } from "@/lib/monitoring/rca";
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
  | "database";

export interface CheckResult {
  ok: boolean;
  status: "up" | "down";
  statusCode: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
  failureReason?: CheckFailureReason | null;
  checkedAt: Date;
  sslExpiresAt: Date | null;
}

export interface NotificationContext {
  kind: "failure" | "recovery" | "latency" | "ssl-expiry" | "status-change" | "downtime-reminder" | "check";
  message: string;
  monitor: Monitor;
  result: CheckResult;
  rca: RootCauseAnalysis;
  emailAttachments?: Mail.Attachment[];
  buildEmailAttachments?: () => Promise<Mail.Attachment[] | undefined>;
}
