export type DiagnosticPhase = "dns" | "tcp" | "tls" | "http" | "content" | "worker";
export type DiagnosticStatus = "ok" | "failed" | "skipped";
export type DiagnosticFailureCategory =
  | "dns_error"
  | "connection_refused"
  | "tls_error"
  | "http_error"
  | "redirect_error"
  | "timeout"
  | "content_mismatch"
  | "network_error";

export interface DiagnosticStepResult {
  status: DiagnosticStatus;
  errorMessage: string | null;
}

export interface MonitorDiagnosticResult {
  status: "ok" | "failed" | "partial";
  failedPhase: DiagnosticPhase | null;
  failureCategory: DiagnosticFailureCategory | null;
  summary: string;
  dnsStatus: DiagnosticStatus | null;
  resolvedIps: string[];
  tcpStatus: DiagnosticStatus | null;
  tlsStatus: DiagnosticStatus | null;
  httpStatus: DiagnosticStatus | null;
  httpStatusCode: number | null;
  responseTimeMs: number | null;
  timeoutMs: number;
  errorMessage: string | null;
  createdAt: Date;
}
