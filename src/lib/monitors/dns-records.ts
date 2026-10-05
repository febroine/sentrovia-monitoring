// DNS monitor options; safe to import in the browser (the matching rules in dns.ts are server-side).
export const DNS_RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS"] as const;
export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];

export const DNS_MATCH_MODES = ["includes", "exact"] as const;
export type DnsMatchMode = (typeof DNS_MATCH_MODES)[number];

export function isDnsRecordType(value: unknown): value is DnsRecordType {
  return typeof value === "string" && (DNS_RECORD_TYPES as readonly string[]).includes(value);
}
