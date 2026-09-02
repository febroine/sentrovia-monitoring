"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MonitorRecord } from "@/lib/monitors/types";
import { showToast } from "@/lib/client-toast";

type Incident = {
  id: string;
  monitorName: string;
  status: string;
  startedAt: string;
  acknowledgedAt: string | null;
  assignedToUserId: string | null;
  escalationLevel: number;
  errorMessage: string | null;
};
type Member = { id: string; email: string; firstName: string; lastName: string };
type MaintenanceWindow = {
  id: string;
  monitorName: string | null;
  kind: string;
  title: string;
  startsAt: string;
  endsAt: string;
  cancelledAt: string | null;
};

export function OperationsConsole({ monitors, canManage }: { monitors: MonitorRecord[]; canManage: boolean }) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [windows, setWindows] = useState<MaintenanceWindow[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [incidentResponse, maintenanceResponse] = await Promise.all([
        fetch("/api/incidents", { cache: "no-store" }),
        fetch("/api/maintenance", { cache: "no-store" }),
      ]);
      const incidentData = await incidentResponse.json();
      const maintenanceData = await maintenanceResponse.json();
      if (!incidentResponse.ok) throw new Error(incidentData.message ?? "Unable to load incidents.");
      if (!maintenanceResponse.ok) throw new Error(maintenanceData.message ?? "Unable to load maintenance.");
      setIncidents(incidentData.incidents ?? []);
      setMembers(incidentData.members ?? []);
      setWindows(maintenanceData.windows ?? []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load operations.");
    }
  }, []);

  useEffect(() => void load(), [load]);
  const activeIncidents = incidents.filter((incident) => incident.status === "open");
  const activeWindows = useMemo(() => {
    const now = Date.now();
    return windows.filter((window) => !window.cancelledAt && new Date(window.endsAt).getTime() > now);
  }, [windows]);

  return (
    <section className="border-y border-border py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Operations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeIncidents.length} active incident{activeIncidents.length === 1 ? "" : "s"} · {activeWindows.length} active or upcoming window{activeWindows.length === 1 ? "" : "s"}
          </p>
        </div>
        {canManage ? <Button size="sm" variant="outline" onClick={() => setMaintenanceOpen(true)}>Schedule maintenance</Button> : null}
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <OperationList title="Active incidents" empty="No active incidents.">
          {activeIncidents.map((incident) => (
            <div className="flex items-start justify-between gap-3 border-t border-border py-3 first:border-t-0" key={incident.id}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{incident.monitorName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {incident.acknowledgedAt ? "Acknowledged" : "Unacknowledged"} · Escalation L{incident.escalationLevel}
                </p>
              </div>
              {canManage ? <Button size="sm" variant="ghost" onClick={() => setSelectedIncident(incident)}>Coordinate</Button> : null}
            </div>
          ))}
        </OperationList>
        <OperationList title="Maintenance & silences" empty="No active or upcoming windows.">
          {activeWindows.map((window) => (
            <div className="flex items-start justify-between gap-3 border-t border-border py-3 first:border-t-0" key={window.id}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{window.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {window.monitorName ?? "All workspace monitors"} · until {new Date(window.endsAt).toLocaleString()}
                </p>
              </div>
              {canManage ? <Button size="sm" variant="ghost" onClick={() => void cancelWindow(window.id, load)}>Cancel</Button> : null}
            </div>
          ))}
        </OperationList>
      </div>
      <MaintenanceDialog open={maintenanceOpen} monitors={monitors} onClose={() => setMaintenanceOpen(false)} onSaved={load} />
      <IncidentDialog incident={selectedIncident} members={members} onClose={() => setSelectedIncident(null)} onSaved={load} />
    </section>
  );
}

function OperationList({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <div><h3 className="text-sm font-semibold">{title}</h3><div className="mt-2">{hasChildren ? children : <p className="py-3 text-sm text-muted-foreground">{empty}</p>}</div></div>;
}

function MaintenanceDialog({ open, monitors, onClose, onSaved }: { open: boolean; monitors: MonitorRecord[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [monitorId, setMonitorId] = useState("all");
  const [kind, setKind] = useState<"maintenance" | "silence">("maintenance");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/maintenance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monitorId: monitorId === "all" ? null : monitorId, kind, title, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to schedule maintenance.");
      await onSaved();
      onClose();
      showToast("Maintenance window scheduled.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to schedule maintenance.", "error");
    } finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>Schedule maintenance</DialogTitle></DialogHeader><div className="space-y-4"><Select value={monitorId} onValueChange={(value) => setMonitorId(String(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All workspace monitors</SelectItem>{monitors.map((monitor) => <SelectItem key={monitor.id} value={monitor.id}>{monitor.name}</SelectItem>)}</SelectContent></Select><Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="maintenance">Planned maintenance</SelectItem><SelectItem value="silence">Temporary silence</SelectItem></SelectContent></Select><Input placeholder="Reason" value={title} onChange={(event) => setTitle(event.target.value)} /><div className="grid gap-3 sm:grid-cols-2"><Input aria-label="Starts at" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /><Input aria-label="Ends at" type="datetime-local" min={startsAt || undefined} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={saving || title.trim().length < 3 || !startsAt || !endsAt || startsAt >= endsAt} onClick={() => void save()}>{saving ? "Saving..." : "Schedule"}</Button></DialogFooter></DialogContent></Dialog>;
}

function IncidentDialog({ incident, members, onClose, onSaved }: { incident: Incident | null; members: Member[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [assignee, setAssignee] = useState("none");
  const [level, setLevel] = useState("0");
  const [note, setNote] = useState("");
  const [visibility, setVisibility] = useState<"internal" | "public">("internal");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (incident) { setAssignee(incident.assignedToUserId ?? "none"); setLevel(String(incident.escalationLevel)); setNote(""); setVisibility("internal"); } }, [incident]);
  async function save() {
    if (!incident) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/incidents/${incident.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acknowledge: true, assignedToUserId: assignee === "none" ? null : assignee, escalationLevel: Number(level), note: note.trim() ? { message: note, visibility, updateType: "status" } : undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to update incident.");
      await onSaved(); onClose(); showToast("Incident updated.", "success");
    } catch (error) { showToast(error instanceof Error ? error.message : "Unable to update incident.", "error"); } finally { setSaving(false); }
  }
  return <Dialog open={Boolean(incident)} onOpenChange={(value) => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>Coordinate incident</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">{incident?.monitorName}</p><Select value={assignee} onValueChange={(value) => setAssignee(String(value))}><SelectTrigger><SelectValue placeholder="Assignee" /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.firstName} {member.lastName} · {member.email}</SelectItem>)}</SelectContent></Select><Select value={level} onValueChange={(value) => setLevel(String(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[0, 1, 2, 3].map((item) => <SelectItem key={item} value={String(item)}>Escalation level {item}</SelectItem>)}</SelectContent></Select><Textarea rows={4} placeholder="Add an incident update" value={note} onChange={(event) => setNote(event.target.value)} /><Select value={visibility} onValueChange={(value) => setVisibility(value as typeof visibility)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="internal">Internal note</SelectItem><SelectItem value="public">Public status update</SelectItem></SelectContent></Select></div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Acknowledge & save"}</Button></DialogFooter></DialogContent></Dialog>;
}

async function cancelWindow(id: string, reload: () => Promise<void>) {
  const response = await fetch(`/api/maintenance/${id}`, { method: "DELETE" });
  const data = await response.json();
  if (!response.ok) return showToast(data.message ?? "Unable to cancel maintenance.", "error");
  await reload();
  showToast("Maintenance window cancelled.", "success");
}
