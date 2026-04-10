"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { IncidentRecord } from "@/lib/monitors/types";

export function IncidentsPageClient() {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [status, setStatus] = useState<"open" | "resolved" | "all">("open");
  const [query, setQuery] = useState("");
  const [selectedIncident, setSelectedIncident] = useState<IncidentRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const loadIncidents = useCallback(async (): Promise<void> => {
    const params = status === "all" ? "" : `?status=${status}`;
    const response = await fetch(`/api/incidents${params}`, { cache: "no-store" });
    const data = (await response.json()) as { incidents?: IncidentRecord[] };
    setIncidents(data.incidents ?? []);
  }, [status]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadIncidents();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadIncidents]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return incidents.filter((incident) => {
      if (!search) {
        return true;
      }

      return [incident.monitorName, incident.company ?? "", incident.errorMessage ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [incidents, query]);

  async function saveIncidentDetails() {
    if (!selectedIncident) {
      return;
    }

    setSaving(true);
    await fetch("/api/incidents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selectedIncident.id,
        notes: selectedIncident.notes,
        postmortem: selectedIncident.postmortem,
      }),
    });
    setSaving(false);
    await loadIncidents();
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Incidents</h1>
          <p className="text-sm text-muted-foreground">Mobile-friendly incident mode with notes and postmortem fields tied to real confirmed outages.</p>
        </div>
        <Button variant="outline" onClick={() => void loadIncidents()}>
          <RefreshCw data-icon="inline-start" />
          Refresh
        </Button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by monitor, company, or last error" />
        <div className="flex gap-2">
          {["open", "resolved", "all"].map((item) => (
            <Button
              key={item}
              variant={status === item ? "default" : "outline"}
              onClick={() => setStatus(item as "open" | "resolved" | "all")}
            >
              {item}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((incident) => (
          <button key={incident.id} type="button" className="text-left" onClick={() => setSelectedIncident(incident)}>
            <Card className="h-full">
              <CardHeader className={`border-l-2 ${incident.status === "open" ? "border-l-rose-500" : "border-l-emerald-500"}`}>
                <CardTitle className="flex items-center gap-2 text-base">
                  {incident.status === "open" ? <AlertTriangle className="size-4 text-rose-500" /> : <CheckCircle2 className="size-4 text-emerald-500" />}
                  {incident.monitorName}
                </CardTitle>
                <CardDescription>{incident.company ?? "Unassigned company"} · {incident.monitorType}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <Metric label="Started" value={new Date(incident.startedAt).toLocaleString()} />
                <Metric label="Status" value={incident.status} />
                <Metric label="Code" value={incident.statusCode?.toString() ?? "N/A"} />
                <p className="line-clamp-3 text-sm text-muted-foreground">{incident.errorMessage ?? "No error message stored."}</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      <Dialog open={Boolean(selectedIncident)} onOpenChange={(open) => !open && setSelectedIncident(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Incident record</DialogTitle>
            <DialogDescription>Capture operator notes during the incident and add a postmortem once the service stabilizes.</DialogDescription>
          </DialogHeader>
          {selectedIncident ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Metric label="Monitor" value={selectedIncident.monitorName} />
                <Metric label="Company" value={selectedIncident.company ?? "None"} />
                <Metric label="Started" value={new Date(selectedIncident.startedAt).toLocaleString()} />
                <Metric label="Resolved" value={selectedIncident.resolvedAt ? new Date(selectedIncident.resolvedAt).toLocaleString() : "Still open"} />
              </div>
              <div className="space-y-2">
                <Label>Incident notes</Label>
                <Textarea
                  rows={5}
                  value={selectedIncident.notes}
                  onChange={(event) => setSelectedIncident({ ...selectedIncident, notes: event.target.value })}
                  placeholder="Capture triage notes, temporary mitigations, or owner updates."
                />
              </div>
              <div className="space-y-2">
                <Label>Postmortem</Label>
                <Textarea
                  rows={8}
                  value={selectedIncident.postmortem}
                  onChange={(event) => setSelectedIncident({ ...selectedIncident, postmortem: event.target.value })}
                  placeholder="Document the root cause, blast radius, timeline, and remediation plan."
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => void saveIncidentDetails()} disabled={saving}>
                  <FileText data-icon="inline-start" />
                  {saving ? "Saving..." : "Save incident notes"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/15 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
