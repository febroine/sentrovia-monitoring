// Which of a company's assigned monitors each company email address receives alerts for. An address
// without an entry receives alerts for every monitor of the company, which is also how every company
// started out; an entry limits it to the listed monitor ids.
export type CompanyRecipientScopes = Record<string, string[]>;

export const MAX_SCOPED_MONITORS_PER_RECIPIENT = 1_000;

// The same normalization the company form applies when it saves the addresses.
export function parseRecipientAddresses(value: string) {
  return Array.from(new Set(
    value
      .split(/[,;\n]/)
      .map((recipient) => recipient.trim().toLowerCase())
      .filter(Boolean)
  ));
}

// Keeps only entries for the company's current addresses, with unique monitor ids.
export function normalizeRecipientScopes(raw: unknown, recipients: string[]): CompanyRecipientScopes {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const known = new Set(recipients.map((recipient) => recipient.trim().toLowerCase()));
  const scopes: CompanyRecipientScopes = {};
  for (const [address, monitorIds] of Object.entries(raw as Record<string, unknown>)) {
    const key = address.trim().toLowerCase();
    if (!known.has(key) || !Array.isArray(monitorIds)) continue;
    scopes[key] = Array.from(new Set(
      monitorIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    )).slice(0, MAX_SCOPED_MONITORS_PER_RECIPIENT);
  }
  return scopes;
}

export function isRecipientLimited(scopes: CompanyRecipientScopes | null | undefined, address: string) {
  return Boolean(scopes && Object.hasOwn(scopes, address.trim().toLowerCase()));
}

// The company addresses that receive this monitor's email alerts. Without a monitor id (a monitor
// being created) only the addresses that cover every monitor apply.
export function companyRecipientsForMonitor(
  recipients: string[] | null | undefined,
  scopes: CompanyRecipientScopes | null | undefined,
  monitorId: string | null
) {
  return (recipients ?? []).filter((address) => {
    const scope = scopes?.[address.trim().toLowerCase()];
    return !scope || (monitorId !== null && scope.includes(monitorId));
  });
}

// Drops monitor ids from every scope; used when monitors leave the company.
export function removeMonitorsFromScopes(scopes: CompanyRecipientScopes, monitorIds: Set<string>) {
  let changed = false;
  const next: CompanyRecipientScopes = {};
  for (const [address, ids] of Object.entries(scopes)) {
    const kept = ids.filter((id) => !monitorIds.has(id));
    changed ||= kept.length !== ids.length;
    next[address] = kept;
  }
  return { scopes: next, changed };
}
