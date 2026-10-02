"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseRecipientAddresses } from "@/lib/companies/recipient-scopes";
import type { MonitorRecord } from "@/lib/monitors/types";
import { getMonitorTargetDisplay } from "@/lib/monitors/targets";

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
  const [selectedOnly, setSelectedOnly] = useState(false);
  const mode: ScopeMode = selectedIds ? "selected" : "all";
  const selected = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  const sorted = useMemo(
    () => [...monitors].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })),
    [monitors]
  );
  const query = search.trim().toLowerCase();
  const filtering = query.length > 0 || selectedOnly;
  const visible = sorted.filter((monitor) =>
    (!selectedOnly || selected.has(monitor.id))
    && (!query || monitor.name.toLowerCase().includes(query) || getMonitorTargetDisplay(monitor).toLowerCase().includes(query))
  );
  const showFilters = monitors.length > 5;

  // Keeps the stored order stable (by name) whatever order the boxes were ticked in.
  const commit = (next: Set<string>) => onChange(sorted.filter((item) => next.has(item.id)).map((item) => item.id));
  const setVisible = (checked: boolean) => {
    const next = new Set(selected);
    for (const monitor of visible) {
      if (checked) next.add(monitor.id);
      else next.delete(monitor.id);
    }
    commit(next);
  };

  return (
    <div className="rounded-md bg-background/40 px-3 py-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 break-all text-sm font-medium">{address}</p>
        <div className="w-full sm:w-56">
          <Select
            value={mode}
            // Switching to selected monitors starts with every monitor ticked, so the address keeps
            // receiving alerts until monitors are unticked rather than going silent at once.
            onValueChange={(value) => onChange(value === "selected" ? sorted.map((monitor) => monitor.id) : undefined)}
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
              {showFilters ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search by name or URL"
                      className="pl-9"
                      aria-label={`Search monitors for ${address}`}
                    />
                  </div>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={selectedOnly}
                      onChange={(event) => setSelectedOnly(event.target.checked)}
                    />
                    Show selected only
                  </label>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground" aria-live="polite">
                  {selected.size} of {monitors.length} selected
                </span>
                <span className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setVisible(true)} disabled={visible.every((monitor) => selected.has(monitor.id))}>
                    {filtering ? "Select shown" : "Select all"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setVisible(false)} disabled={!visible.some((monitor) => selected.has(monitor.id))}>
                    {filtering ? "Clear shown" : "Clear"}
                  </Button>
                </span>
              </div>
              <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border/60 p-1">
                {visible.map((monitor) => (
                  <label key={monitor.id} className="flex cursor-pointer items-start gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-muted/40">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-primary"
                      checked={selected.has(monitor.id)}
                      onChange={(event) => {
                        const next = new Set(selected);
                        if (event.target.checked) next.add(monitor.id);
                        else next.delete(monitor.id);
                        commit(next);
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate">{monitor.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{getMonitorTargetDisplay(monitor)}</span>
                    </span>
                  </label>
                ))}
                {visible.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    {selectedOnly && !query ? "No monitor is selected yet." : "No monitors matched."}
                  </p>
                ) : null}
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
