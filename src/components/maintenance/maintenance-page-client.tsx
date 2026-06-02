"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarClock, CheckCircle2, PauseCircle, RefreshCw, Trash2, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Scope = "all" | "monitors" | "companies" | "tags";
type Recurrence = "none" | "daily" | "weekly";

type MaintenanceWindow = FormState & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

type MonitorOption = {
  id: string;
  name: string;
  url: string;
  tags: string[];
};

type CompanyOption = {
  id: string;
  name: string;
};

type FormState = {
  name: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  recurrence: Recurrence;
  scope: Scope;
  monitorIds: string[];
  companyIds: string[];
  tags: string[];
  isActive: boolean;
  suppressNotifications: boolean;
  suppressChecks: boolean;
  reason: string;
};

const DEFAULT_FORM: FormState = {
  name: "",
  startsAt: toDateTimeLocal(new Date()),
  endsAt: toDateTimeLocal(new Date(Date.now() + 60 * 60_000)),
  timezone: "Europe/Istanbul",
  recurrence: "none",
  scope: "all",
  monitorIds: [],
  companyIds: [],
  tags: [],
  isActive: true,
  suppressNotifications: true,
  suppressChecks: false,
  reason: "",
};

export function MaintenancePageClient() {
  const [windows, setWindows] = useState<MaintenanceWindow[]>([]);
  const [monitors, setMonitors] = useState<MonitorOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const tagOptions = useMemo(() => {
    const tags = monitors.flatMap((monitor) => monitor.tags ?? []);
    return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).sort();
  }, [monitors]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [maintenanceResponse, monitorsResponse, companiesResponse] = await Promise.all([
        fetch("/api/maintenance", { cache: "no-store" }),
        fetch("/api/monitors", { cache: "no-store" }),
        fetch("/api/companies", { cache: "no-store" }),
      ]);
      const maintenanceData = await readJson<{ windows?: MaintenanceWindow[]; message?: string }>(maintenanceResponse);
      const monitorsData = await readJson<{ monitors?: MonitorOption[] }>(monitorsResponse);
      const companiesData = await readJson<{ companies?: CompanyOption[] }>(companiesResponse);

      if (!maintenanceResponse.ok) {
        throw new Error(maintenanceData.message ?? "Unable to load maintenance windows.");
      }

      setWindows(maintenanceData.windows ?? []);
      setMonitors(monitorsData.monitors ?? []);
      setCompanies(companiesData.companies ?? []);
      setMessage(null);
    } catch (error) {
      setMessage(toMessage(error, "Unable to load maintenance windows."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function saveWindow() {
    try {
      const endpoint = editingId ? `/api/maintenance/${editingId}` : "/api/maintenance";
      const response = await fetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form)),
      });
      const data = await readJson<{ message?: string }>(response);
      if (!response.ok) {
        throw new Error(data.message ?? "Unable to save maintenance window.");
      }

      resetForm();
      await loadData();
      setMessage("Maintenance window saved.");
    } catch (error) {
      setMessage(toMessage(error, "Unable to save maintenance window."));
    }
  }

  async function deleteWindow(id: string) {
    try {
      const response = await fetch(`/api/maintenance/${id}`, { method: "DELETE" });
      const data = await readJson<{ message?: string }>(response);
      if (!response.ok) {
        throw new Error(data.message ?? "Unable to delete maintenance window.");
      }

      await loadData();
      setMessage("Maintenance window deleted.");
    } catch (error) {
      setMessage(toMessage(error, "Unable to delete maintenance window."));
    }
  }

  function editWindow(window: MaintenanceWindow) {
    setEditingId(window.id);
    setForm({
      ...window,
      startsAt: toDateTimeLocal(new Date(window.startsAt)),
      endsAt: toDateTimeLocal(new Date(window.endsAt)),
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
  }

  return (
    <div className="space-y-6">
      <PageHeader loading={loading} onRefresh={loadData} />
      {message ? <div className="rounded-lg border px-4 py-3 text-sm">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <MaintenanceForm
          form={form}
          editing={Boolean(editingId)}
          monitors={monitors}
          companies={companies}
          tagOptions={tagOptions}
          onChange={setForm}
          onCancel={resetForm}
          onSave={saveWindow}
        />
        <MaintenanceList windows={windows} loading={loading} onEdit={editWindow} onDelete={deleteWindow} />
      </div>
    </div>
  );
}

function PageHeader({ loading, onRefresh }: { loading: boolean; onRefresh: () => void }) {
  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Maintenance Windows</h1>
        <p className="text-sm text-muted-foreground">
          Schedule planned work, suppress noisy alerts, and optionally pause checks during approved windows.
        </p>
      </div>
      <Button variant="outline" onClick={onRefresh} disabled={loading}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Refresh
      </Button>
    </header>
  );
}

function MaintenanceForm({
  form,
  editing,
  monitors,
  companies,
  tagOptions,
  onChange,
  onCancel,
  onSave,
}: {
  form: FormState;
  editing: boolean;
  monitors: MonitorOption[];
  companies: CompanyOption[];
  tagOptions: string[];
  onChange: (next: FormState) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => onChange({ ...form, [key]: value });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/15 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4 text-sky-500" />
          {editing ? "Edit Window" : "New Window"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 border-l-2 border-l-sky-500 p-5">
        <Field label="Name"><Input value={form.name} onChange={(event) => set("name", event.target.value)} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts"><Input type="datetime-local" value={form.startsAt} onChange={(event) => set("startsAt", event.target.value)} /></Field>
          <Field label="Ends"><Input type="datetime-local" value={form.endsAt} onChange={(event) => set("endsAt", event.target.value)} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Timezone"><Input value={form.timezone} onChange={(event) => set("timezone", event.target.value)} /></Field>
          <SelectField label="Recurrence" value={form.recurrence} onValueChange={(value) => set("recurrence", value as Recurrence)}>
            <SelectItem value="none">One time</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectField>
        </div>
        <SelectField label="Scope" value={form.scope} onValueChange={(value) => set("scope", value as Scope)}>
          <SelectItem value="all">All monitors</SelectItem>
          <SelectItem value="monitors">Selected monitors</SelectItem>
          <SelectItem value="companies">Selected companies</SelectItem>
          <SelectItem value="tags">Selected tags</SelectItem>
        </SelectField>
        <ScopePicker form={form} monitors={monitors} companies={companies} tagOptions={tagOptions} onChange={onChange} />
        <ToggleRow label="Suppress notifications" checked={form.suppressNotifications} onChange={(value) => set("suppressNotifications", value)} />
        <ToggleRow label="Skip checks" checked={form.suppressChecks} onChange={(value) => set("suppressChecks", value)} />
        <ToggleRow label="Active" checked={form.isActive} onChange={(value) => set("isActive", value)} />
        <Field label="Reason"><Textarea value={form.reason} onChange={(event) => set("reason", event.target.value)} /></Field>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void onSave()}>{editing ? "Save Window" : "Create Window"}</Button>
          {editing ? <Button variant="outline" onClick={onCancel}>Cancel</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ScopePicker({
  form,
  monitors,
  companies,
  tagOptions,
  onChange,
}: {
  form: FormState;
  monitors: MonitorOption[];
  companies: CompanyOption[];
  tagOptions: string[];
  onChange: (next: FormState) => void;
}) {
  if (form.scope === "all") {
    return null;
  }

  if (form.scope === "monitors") {
    return <CheckboxList items={monitors.map((item) => ({ id: item.id, label: item.name || item.url }))} selected={form.monitorIds} onChange={(ids) => onChange({ ...form, monitorIds: ids })} />;
  }

  if (form.scope === "companies") {
    return <CheckboxList items={companies.map((item) => ({ id: item.id, label: item.name }))} selected={form.companyIds} onChange={(ids) => onChange({ ...form, companyIds: ids })} />;
  }

  return <CheckboxList items={tagOptions.map((tag) => ({ id: tag, label: tag }))} selected={form.tags} onChange={(tags) => onChange({ ...form, tags })} />;
}

function CheckboxList({
  items,
  selected,
  onChange,
}: {
  items: Array<{ id: string; label: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="max-h-52 space-y-2 overflow-auto rounded-lg border p-3">
      {items.length === 0 ? <p className="text-sm text-muted-foreground">No options available.</p> : null}
      {items.map((item) => (
        <label key={item.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected.includes(item.id)}
            onChange={(event) => onChange(toggleSelection(selected, item.id, event.target.checked))}
          />
          <span className="min-w-0 truncate">{item.label}</span>
        </label>
      ))}
    </div>
  );
}

function MaintenanceList({
  windows,
  loading,
  onEdit,
  onDelete,
}: {
  windows: MaintenanceWindow[];
  loading: boolean;
  onEdit: (window: MaintenanceWindow) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {windows.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">{loading ? "Loading windows..." : "No maintenance windows yet."}</CardContent></Card>
      ) : null}
      {windows.map((window) => (
        <Card key={window.id} className="overflow-hidden">
          <CardContent className="border-l-2 border-l-emerald-500 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-semibold">{window.name}</h2>
                  <Badge variant={window.isActive ? "default" : "outline"}>{window.isActive ? "Active" : "Inactive"}</Badge>
                  <Badge variant="outline">{window.recurrence}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{formatDate(window.startsAt)} - {formatDate(window.endsAt)}</p>
                <p className="text-xs text-muted-foreground">Scope: {formatScope(window)} | Timezone: {window.timezone}</p>
                {window.reason ? <p className="text-sm">{window.reason}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => onEdit(window)}>
                  <CalendarClock className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => void onDelete(window.id)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <StatusPill active={window.suppressNotifications} label="Notifications suppressed" />
              <StatusPill active={window.suppressChecks} label="Checks skipped" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function SelectField({ label, value, onValueChange, children }: { label: string; value: string; onValueChange: (value: string) => void; children: ReactNode }) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={(nextValue) => onValueChange(String(nextValue))}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </Field>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-3">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  const Icon = active ? PauseCircle : CheckCircle2;
  return <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1"><Icon className="h-3.5 w-3.5" />{label}: {active ? "yes" : "no"}</span>;
}

function toPayload(form: FormState) {
  return {
    ...form,
    startsAt: new Date(form.startsAt).toISOString(),
    endsAt: new Date(form.endsAt).toISOString(),
  };
}

function toggleSelection(selected: string[], id: string, checked: boolean) {
  return checked ? Array.from(new Set([...selected, id])) : selected.filter((item) => item !== id);
}

function toDateTimeLocal(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
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

function formatScope(window: MaintenanceWindow) {
  if (window.scope === "monitors") return `${window.monitorIds.length} monitor(s)`;
  if (window.scope === "companies") return `${window.companyIds.length} company(s)`;
  if (window.scope === "tags") return `${window.tags.length} tag(s)`;
  return "all monitors";
}
