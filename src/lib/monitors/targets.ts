import type { MonitorPayload, MonitorRecord, MonitorType } from "@/lib/monitors/types";

const DEFAULT_PORT_MONITOR_PORT = 443;
const DEFAULT_POSTGRES_PORT = 5432;

type TargetShape = Pick<
  MonitorPayload,
  | "monitorType"
  | "url"
  | "portHost"
  | "portNumber"
  | "heartbeatToken"
  | "databaseHost"
  | "databasePort"
  | "databaseName"
  | "databaseUsername"
  | "keywordQuery"
  | "jsonPath"
>;

export function buildCanonicalMonitorTarget(input: TargetShape) {
  if (input.monitorType === "port") {
    return buildPortMonitorTarget(input.portHost, input.portNumber);
  }

  if (input.monitorType === "ping") {
    return buildPingMonitorTarget(input.portHost);
  }

  if (input.monitorType === "heartbeat") {
    return buildHeartbeatMonitorTarget(input.heartbeatToken);
  }

  if (input.monitorType === "postgres") {
    return buildPostgresMonitorTarget(
      input.databaseHost,
      input.databasePort,
      input.databaseName,
      input.databaseUsername
    );
  }

  if (input.monitorType === "keyword") {
    return `${input.url.trim()}#keyword=${encodeURIComponent(input.keywordQuery.trim())}`;
  }

  if (input.monitorType === "json") {
    return `${input.url.trim()}#json=${encodeURIComponent(input.jsonPath.trim())}`;
  }

  return input.url.trim();
}

export function buildMonitorIdentityKey(input: { monitorType: MonitorType; url: string }) {
  return `${input.monitorType}:${input.url.trim().toLowerCase()}`;
}

export function getMonitorTargetDisplay(input: { monitorType: string; url: string }) {
  if (input.monitorType === "port") {
    const target = parsePortMonitorTarget(input.url);
    return `${target.host}:${target.port}`;
  }

  if (input.monitorType === "ping") {
    const target = parsePingMonitorTarget(input.url);
    return target.host;
  }

  if (input.monitorType === "heartbeat") {
    const target = parseHeartbeatMonitorTarget(input.url);
    return target.token ? `heartbeat:${target.token}` : "Heartbeat endpoint";
  }

  if (input.monitorType === "postgres") {
    const target = parsePostgresMonitorTarget(input.url);
    return `${target.host}:${target.port}/${target.databaseName}`;
  }

  if (input.monitorType === "keyword" || input.monitorType === "json") {
    return input.url.split("#")[0];
  }

  return input.url;
}

export function getMonitorTypeLabel(type: MonitorType | string) {
  if (type === "heartbeat") {
    return "Cron / Heartbeat";
  }

  if (type === "ping") {
    return "Ping / ICMP";
  }

  if (type === "port") {
    return "TCP / Port";
  }

  if (type === "postgres") {
    return "PostgreSQL";
  }

  if (type === "keyword") {
    return "Keyword";
  }

  if (type === "json") {
    return "JSON Assertion";
  }

  return "HTTP";
}

export function parsePortMonitorTarget(url: string) {
  const parsed = safeParseUrl(url);

  if (!parsed) {
    return {
      host: stripProtocol(url),
      port: DEFAULT_PORT_MONITOR_PORT,
    };
  }

  return {
    host: stripIpv6Brackets(parsed.hostname || parsed.host || ""),
    port: toPort(parsed.port, DEFAULT_PORT_MONITOR_PORT),
  };
}

export function parsePostgresMonitorTarget(url: string) {
  const parsed = safeParseUrl(url);

  if (!parsed) {
    return {
      host: "",
      port: DEFAULT_POSTGRES_PORT,
      databaseName: "",
      databaseUsername: "",
    };
  }

  return {
    host: stripIpv6Brackets(parsed.hostname || parsed.host || ""),
    port: toPort(parsed.port, DEFAULT_POSTGRES_PORT),
    databaseName: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    databaseUsername: decodeURIComponent(parsed.username || ""),
  };
}

export function parsePingMonitorTarget(url: string) {
  const parsed = safeParseUrl(url);

  if (!parsed) {
    return {
      host: stripProtocol(url),
    };
  }

  return {
    host: stripIpv6Brackets(parsed.hostname || parsed.host || ""),
  };
}

export function parseHeartbeatMonitorTarget(url: string) {
  return {
    token: decodeURIComponent(stripProtocol(url).replace(/^\/+/, "").trim()),
  };
}

export function toMonitorPayload(record: MonitorRecord): MonitorPayload {
  const portTarget = record.monitorType === "port" ? parsePortMonitorTarget(record.url) : null;
  const pingTarget = record.monitorType === "ping" ? parsePingMonitorTarget(record.url) : null;
  const heartbeatTarget = record.monitorType === "heartbeat" ? parseHeartbeatMonitorTarget(record.url) : null;
  const databaseTarget = record.monitorType === "postgres" ? parsePostgresMonitorTarget(record.url) : null;
  const baseUrl = record.monitorType === "http" || record.monitorType === "keyword" || record.monitorType === "json"
    ? record.url.split("#")[0]
    : "";

  return {
    name: record.name,
    monitorType: record.monitorType,
    url: baseUrl,
    portHost: portTarget?.host ?? pingTarget?.host ?? "",
    portNumber: portTarget?.port ?? DEFAULT_PORT_MONITOR_PORT,
    heartbeatToken: record.heartbeatToken ?? heartbeatTarget?.token ?? "",
    heartbeatLastReceivedAt: record.heartbeatLastReceivedAt,
    databaseHost: databaseTarget?.host ?? "",
    databasePort: databaseTarget?.port ?? DEFAULT_POSTGRES_PORT,
    databaseName: databaseTarget?.databaseName ?? "",
    databaseUsername: databaseTarget?.databaseUsername ?? "",
    databasePassword: "",
    databasePasswordConfigured: record.databasePasswordConfigured,
    databaseSsl: record.databaseSsl,
    keywordQuery: record.keywordQuery ?? "",
    keywordInvert: record.keywordInvert,
    jsonPath: record.jsonPath ?? "",
    jsonExpectedValue: record.jsonExpectedValue ?? "",
    jsonMatchMode: record.jsonMatchMode,
    companyId: record.companyId ?? "",
    company: record.company ?? "",
    notificationPref: record.notificationPref,
    notifEmail: record.notifEmail ?? "",
    telegramBotToken: record.telegramBotToken ?? "",
    telegramChatId: record.telegramChatId ?? "",
    intervalValue: record.intervalValue,
    intervalUnit: record.intervalUnit,
    timeout: record.timeout,
    retries: record.retries,
    method: record.method,
    tags: record.tags,
    renotifyCount: record.renotifyCount,
    maxRedirects: record.maxRedirects,
    ipFamily: record.ipFamily,
    checkSslExpiry: record.checkSslExpiry,
    ignoreSslErrors: record.ignoreSslErrors,
    cacheBuster: record.cacheBuster,
    saveErrorPages: record.saveErrorPages,
    saveSuccessPages: record.saveSuccessPages,
    responseMaxLength: record.responseMaxLength,
    telegramTemplate: record.telegramTemplate ?? "",
    emailSubject: record.emailSubject ?? "",
    emailBody: record.emailBody ?? "",
    isActive: record.isActive,
  };
}

function buildPortMonitorTarget(host: string, port: number) {
  const normalizedHost = normalizeHost(host);
  return `tcp://${normalizedHost}:${toPort(port, DEFAULT_PORT_MONITOR_PORT)}`;
}

function buildPingMonitorTarget(host: string) {
  const normalizedHost = normalizeHost(host);
  return `icmp://${normalizedHost}`;
}

function buildHeartbeatMonitorTarget(token: string) {
  return `heartbeat://${encodeURIComponent(token.trim())}`;
}

function buildPostgresMonitorTarget(host: string, port: number, databaseName: string, username: string) {
  const normalizedHost = normalizeHost(host);
  const safeName = encodeURIComponent(databaseName.trim());
  const safeUser = encodeURIComponent(username.trim());
  return `postgres://${safeUser}@${normalizedHost}:${toPort(port, DEFAULT_POSTGRES_PORT)}/${safeName}`;
}

function safeParseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeHost(value: string) {
  const host = stripIpv6Brackets(stripProtocol(value).trim());

  if (host.includes(":") && !host.startsWith("[") && !host.endsWith("]")) {
    return `[${host}]`;
  }

  return host;
}

function stripProtocol(value: string) {
  return value.replace(/^[a-z]+:\/\//i, "");
}

function stripIpv6Brackets(value: string) {
  return value.replace(/^\[/, "").replace(/\]$/, "");
}

function toPort(value: number | string, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : fallback;
}
