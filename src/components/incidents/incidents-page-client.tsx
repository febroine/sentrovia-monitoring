"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type IncidentOverview = {
  summary: { open: number; resolved: number; total: number };
  openIncidents: Incident[];
  recentResolvedIncidents: Incident[];
};

type Incident = {
  id: string;
  monitorName: string;
  monitorType: string;
  company: string | null;
  status: "open" | "resolved";
  startedAt: string;
  resolvedAt: string | null;
  lastCheckedAt: string | null;
  statusCode: number | null;
  errorMessage: string | null;
  acknowledgedAt: string | null;
  acknowledgementNote: string;
  timeline: IncidentEvent[];
};

type IncidentEvent = {
  id: string;
  eventType: string;
  title: string;
  detail: string | null;
  createdAt: string;
};

const EMPTY_OVERVIEW: IncidentOverview = {
  summary: { open: 0, resolved: 0, total: 0 },
  openIncidents: [],
  recentResolvedIncidents: [],
};

export function IncidentsPageClient() {
  const [overview, setOverview] = useState<IncidentOverview>(EMPTY_OVERVIEW);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/incidents", { cache: "no-store" });
      const data = await readJson<{ overview?: IncidentOverview; message?: string }>(response);
      if (!response.ok) {
        throw new Error(data.message ?? "Unable to load incidents.");
      }

      setOverview(data.overview ?? EMPTY_OVERVIEW);
      setMessage(null);
    } catch (error) {
      setMessage(toMessage(error, "Unable to load incidents."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  async function acknowledgeIncident(incidentId: string) {
    try {
      const response = await fetch(`/api/incidents/${incidentId}/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: notes[incidentId] ?? "" }),
      });
      const data = await readJson<{ message?: string }>(response);
      if (!response.ok) {
        throw new Error(data.message ?? "Unable to acknowledge incident.");
      }

      setNotes((current) => ({ ...current, [incidentId]: "" }));
      await loadOverview();
      setMessage("Incident acknowledged.");
    } catch (error) {
      setMessage(toMessage(error, "Unable to acknowledge incident."));
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Incidents</h1>
          <p className="text-sm text-muted-foreground">
            Review confirmed outages, acknowledge ownership, and follow the incident timeline.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadOverview()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </header>

      {message ? <div className="rounded-lg border px-4 py-3 text-sm">{message}</div> : null}
      <SummaryCards overview={overview} />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Open Incidents</h2>
        {overview.openIncidents.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">{loading ? "Loading incidents..." : "No open incidents."}</CardContent></Card>
        ) : null}
        {overview.openIncidents.map((incident) => (
          <IncidentCard
            key={incident.id}
            incident={incident}
            note={notes[incident.id] ?? ""}
            onNoteChange={(note) => setNotes((current) => ({ ...current, [incident.id]: note }))}
            onAcknowledge={() => void acknowledgeIncident(incident.id)}
          />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Recently Resolved</h2>
        {overview.recentResolvedIncidents.map((incident) => (
          <IncidentCard key={incident.id} incident={incident} />
        ))}
      </section>
    </div>
  );
}

function SummaryCards({ overview }: { overview: IncidentOverview }) {
  const cards = [
    { label: "Open", value: overview.summary.open, icon: AlertTriangle, tone: "border-l-rose-500" },
    { label: "Resolved", value: overview.summary.resolved, icon: CheckCircle2, tone: "border-l-emerald-500" },
    { label: "Total", value: overview.summary.total, icon: Clock3, tone: "border-l-sky-500" },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cards.map(({ label, value, icon: Icon, tone }) => (
        <Card key={label} className="overflow-hidden">
          <CardContent className={`border-l-2 ${tone} px-4 py-3`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </div>
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function IncidentCard({
  incident,
  note,
  onNoteChange,
  onAcknowledge,
}: {
  incident: Incident;
  note?: string;
  onNoteChange?: (note: string) => void;
  onAcknowledge?: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/15 pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{incident.monitorName}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{incident.company ?? "No company"} | {incident.monitorType}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={incident.status === "open" ? "destructive" : "default"}>{incident.status}</Badge>
            {incident.acknowledgedAt ? <Badge variant="outline">Acknowledged</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 border-l-2 border-l-rose-500 p-5">
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <Metric label="Started" value={formatDate(incident.startedAt)} />
          <Metric label="Last Check" value={incident.lastCheckedAt ? formatDate(incident.lastCheckedAt) : "-"} />
          <Metric label="Status Code" value={incident.statusCode ? String(incident.statusCode) : "-"} />
        </div>
        {incident.errorMessage ? <p className="rounded-lg border bg-muted/15 p-3 text-sm">{incident.errorMessage}</p> : null}
        {incident.acknowledgedAt ? (
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">Acknowledged {formatDate(incident.acknowledgedAt)}</p>
            {incident.acknowledgementNote ? <p className="mt-1 text-muted-foreground">{incident.acknowledgementNote}</p> : null}
          </div>
        ) : null}
        {onAcknowledge ? (
          <div className="space-y-2">
            <Textarea value={note} onChange={(event) => onNoteChange?.(event.target.value)} placeholder="Optional acknowledgement note" />
            <Button onClick={onAcknowledge}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Acknowledge
            </Button>
          </div>
        ) : null}
        <Timeline events={incident.timeline} />
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>;
}

function Timeline({ events }: { events: IncidentEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No timeline events recorded yet.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Timeline</p>
      {events.map((event) => (
        <div key={event.id} className="rounded-lg border px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{event.title}</p>
            <span className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</span>
          </div>
          {event.detail ? <p className="mt-1 text-muted-foreground">{event.detail}</p> : null}
        </div>
      ))}
    </div>
  );
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

function toMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
