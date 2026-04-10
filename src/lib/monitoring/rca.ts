import { getHttpStatusMeta } from "@/lib/http/status-codes";

export type RcaType =
  | "healthy"
  | "dns"
  | "timeout"
  | "connection-refused"
  | "ssl"
  | "database-auth"
  | "database"
  | "http-client"
  | "http-server"
  | "redirect"
  | "network";

export interface RootCauseAnalysis {
  type: RcaType;
  title: string;
  summary: string;
  details: string;
}

export function analyzeRootCause(input: {
  statusCode: number | null;
  errorMessage: string | null;
  ok: boolean;
}): RootCauseAnalysis {
  if (input.ok) {
    return {
      type: "healthy",
      title: "Healthy Response",
      summary: "The endpoint responded within the expected success range.",
      details: "No RCA issue was detected for this check.",
    };
  }

  const error = (input.errorMessage ?? "").toLowerCase();

  if (isDnsError(error)) {
    return buildRca(
      "dns",
      "DNS Resolution Failure",
      "The hostname did not resolve to an IP address during the check, so the worker could not even open a network connection.",
      "Verify the domain value, DNS A/AAAA records, nameserver health, resolver availability, and whether recent DNS changes have fully propagated."
    );
  }

  if (error.includes("timed out")) {
    return buildRca(
      "timeout",
      "Request Timeout",
      "The TCP connection or HTTP response did not complete before the configured timeout window expired.",
      "Review server response time, upstream dependencies, slow database calls, edge firewall latency, and whether the current timeout is too aggressive for this endpoint."
    );
  }

  if (error.includes("refused") || error.includes("econnrefused")) {
    return buildRca(
      "connection-refused",
      "Connection Refused",
      "The remote host was reachable, but the TCP connection was actively rejected before an HTTP response could be served.",
      "The target service may be stopped, the port may be closed, the listener may be unhealthy, or a host-level firewall may be rejecting inbound traffic."
    );
  }

  if (isSslError(error)) {
    return buildRca(
      "ssl",
      "SSL/TLS Failure",
      "The request failed during TLS negotiation or certificate validation before the endpoint could return an application response.",
      "Inspect certificate validity dates, chain completeness, hostname matching, supported protocol versions, TLS termination settings, and whether the monitor intentionally allows invalid certificates."
    );
  }

  if (isDatabaseAuthError(error)) {
    return buildRca(
      "database-auth",
      "Database Authentication Failure",
      "The database endpoint was reachable, but the supplied credentials or role permissions were rejected during connection setup.",
      "Verify the username, password, database role grants, target database name, and whether the credential rotated without being updated in the monitor."
    );
  }

  if (isDatabaseError(error)) {
    return buildRca(
      "database",
      "Database Connectivity Failure",
      "The worker reached the database endpoint, but the connection or validation query failed before a healthy response could be confirmed.",
      "Check database availability, connection limits, target port, SSL requirements, startup recovery state, and whether the database is accepting client sessions."
    );
  }

  if (input.statusCode && input.statusCode >= 500) {
    const meta = getHttpStatusMeta(input.statusCode);
    return buildRca(
      "http-server",
      "Server Error (5XX)",
      `${input.statusCode} ${meta?.label ?? "Server Error"} means the request reached the application stack, but the service or one of its upstream dependencies failed while processing it.`,
      meta?.explanation ??
        "Check application logs, recent deployments, reverse proxy behavior, dependency health, database connectivity, and upstream gateway errors."
    );
  }

  if (input.statusCode && input.statusCode >= 400) {
    const meta = getHttpStatusMeta(input.statusCode);
    return buildRca(
      "http-client",
      "Client Error (4XX)",
      `${input.statusCode} ${meta?.label ?? "Client Error"} means the endpoint was reachable but rejected the request as invalid, unauthorized, forbidden, or missing expected input.`,
      meta?.explanation ??
        "Review the URL path, expected authentication, authorization rules, request method, redirects, and any payload or header requirements."
    );
  }

  if (input.statusCode && input.statusCode >= 300) {
    const meta = getHttpStatusMeta(input.statusCode);
    return buildRca(
      "redirect",
      "Redirect Handling Issue",
      `${input.statusCode} ${meta?.label ?? "Redirect"} shows the endpoint redirected in a way that did not fit the current redirect policy or redirect limit.`,
      "Review redirect targets, HTTPS enforcement, redirect loops, load balancer rules, and the monitor's max redirect setting."
    );
  }

  return buildRca(
    "network",
    "Generic Network Failure",
    input.errorMessage ?? "The request failed due to a non-specific network-layer problem before a valid application response was received.",
    "Inspect outbound connectivity, routing, security groups, load balancers, NAT or proxy behavior, and upstream network availability."
  );
}

function buildRca(type: RcaType, title: string, summary: string, details: string): RootCauseAnalysis {
  return { type, title, summary, details };
}

function isDnsError(error: string) {
  return ["enotfound", "eai_again", "dns", "name resolution"].some((token) => error.includes(token));
}

function isSslError(error: string) {
  return ["certificate", "ssl", "tls", "self signed", "hostname"].some((token) => error.includes(token));
}

function isDatabaseAuthError(error: string) {
  return ["password authentication failed", "authentication failed", "role", "permission denied"].some((token) =>
    error.includes(token)
  );
}

function isDatabaseError(error: string) {
  return ["postgres", "database", "relation", "connection terminated", "too many clients"].some((token) =>
    error.includes(token)
  );
}
