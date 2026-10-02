"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseRecipientAddresses } from "@/lib/companies/recipient-scopes";
import type { MonitorRecord } from "@/lib/monitors/types";

type ScopeMode = "all" | "selected";

// Per company address: alerts for every monitor of the company, or only for the selected ones.
export function CompanyRecipientScopes({
  recipientsText,
  scopes,
  monitors,
  onChange,
}: {
  recipientsText: string;
  scopes: Record<string, string[]>;
  // The company's monitors; undefined while a company is being created.
  monitors: MonitorRecord[] | undefined;
  onChange: (scopes: Record<string, string[]>) => void;
}) {
  const addresses = parseRecipientAddresses(recipientsText);

  if (addresses.length === 0) {
    return null;
  }

  if (!monitors) {
    return (
      <p className="text-xs text-muted-foreground">
        Every address receives alerts for all of this company&apos;s monitors. After you assign monitors, edit the company to limit an address to some of them.
      </p>
    );
  }

  return (
    <div className="space-y-2" aria-label="Which monitors each address receives alerts for">
      <p className="text-xs font-medium text-muted-foreground">Which monitors each address receives alerts for</p>
      {addresses.map((address) => (
        <AddressScope
          key={address}
          address={address}
          selectedIds={scopes[address]}
          monitors={monitors}
          onChange={(ids) => {
            const next = { ...scopes };
            if (ids === undefined) delete next[address];
            else next[address] = ids;
            onChange(next);
          }}
        />
      ))}
      <p className="text-[11px] text-muted-foreground">
        Monitors assigned to the company later are added only to addresses set to all monitors. A monitor no address covers sends to its own recipients or the workspace address.
      </p>
    </div>
  );
}

function AddressScope({
  address,
  selectedIds,
  monitors,
  onChange,
}: {
  address: string;
  selectedIds: string[] | undefined;
  monitors: MonitorRecord[];
  onChange: (ids: string[] | undefined) => void;
}) {
  const [search, setSearch] = useState("");
  const mode: ScopeMode = selectedIds ? "selected" : "all";
  const selected = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? monitors.filter((monitor) => monitor.name.toLowerCase().includes(query) || monitor.url.toLowerCase().includes(query))
      : monitors;
  }, [monitors, search]);

  return (
    <div className="rounded-md bg-background/40 px-3 py-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 break-all text-sm font-medium">{address}</p>
        <div className="w-full sm:w-56">
          <Select
            value={mode}
            onValueChange={(value) => onChange(value === "selected" ? Array.from(selected) : undefined)}
          >
            <SelectTrigger aria-label={`Monitors for ${address}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All monitors</SelectItem>
              <SelectItem value="selected">{`Selected monitors (${selected.size})`}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {mode === "selected" ? (
        <div className="mt-3 space-y-2">
          {monitors.length === 0 ? (
            <p className="text-xs text-muted-foreground">This company has no monitors yet.</p>
          ) : (
            <>
              {monitors.length > 8 ? (
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search monitors"
                    className="pl-9"
                    aria-label={`Search monitors for ${address}`}
                  />
                </div>
              ) : null}
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {visible.map((monitor) => (
                  <label key={monitor.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm hover:bg-muted/40">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-primary"
                      checked={selected.has(monitor.id)}
                      onChange={(event) => {
                        const next = new Set(selected);
                        if (event.target.checked) next.add(monitor.id);
                        else next.delete(monitor.id);
                        onChange(monitors.filter((item) => next.has(item.id)).map((item) => item.id));
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{monitor.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{monitor.url}</span>
                    </span>
                  </label>
                ))}
                {visible.length === 0 ? <p className="text-xs text-muted-foreground">No monitors matched.</p> : null}
              </div>
              {selected.size === 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">No monitor is selected, so this address receives no alerts.</p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
