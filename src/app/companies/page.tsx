"use client";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ElementType,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Building2, CheckSquare, Pencil, Plus, Search, Server, Square, Trash2, Users } from "lucide-react";
import { CompanyMonitorsPanel } from "@/components/companies/company-monitors-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_COMPANY_FORM, type CompanyPayload, type CompanyRecord } from "@/lib/companies/types";
import type { MonitorRecord } from "@/lib/monitors/types";
import { cn } from "@/lib/utils";
import { useCompaniesStore } from "@/stores/use-companies-store";

export default function CompaniesPage() {
  const { companies, loading, saving, error, loadCompanies, createCompany, updateCompany, deleteCompany, bulkAction } =
    useCompaniesStore();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<CompanyPayload>(DEFAULT_COMPANY_FORM);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailCompany, setDetailCompany] = useState<CompanyRecord | null>(null);
  const [monitors, setMonitors] = useState<MonitorRecord[]>([]);

  useEffect(() => {
    let active = true;
    void loadCompanies();
    fetch("/api/monitors", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { monitors?: MonitorRecord[] };
        if (active) {
          setMonitors(data.monitors ?? []);
        }
      })
      .catch(() => {
        if (active) {
          setMonitors([]);
        }
      });

    return () => {
      active = false;
    };
  }, [loadCompanies]);

  const filtered = useMemo(
    () => companies.filter((company) => !search.trim() || company.name.toLowerCase().includes(search.trim().toLowerCase())),
    [companies, search]
  );

  const totals = {
    companies: companies.length,
    active: companies.filter((company) => company.isActive).length,
    monitors: companies.reduce((sum, company) => sum + company.monitorsCount, 0),
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((company) => selectedIds.has(company.id));

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await createCompany(form);
    if (created) {
      setForm(DEFAULT_COMPANY_FORM);
      setCreateOpen(false);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const updated = await updateCompany(editing.id, form);
    if (updated) {
      setEditing(null);
      setForm(DEFAULT_COMPANY_FORM);
    }
  }

  async function handleBulk(action: "activate" | "deactivate" | "delete") {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const result = await bulkAction(action, ids);
    if (result) {
      setSelectedIds(new Set());
    }
  }

  function openEdit(company: CompanyRecord) {
    setEditing(company);
    setForm({
      name: company.name,
      description: company.description ?? "",
      isActive: company.isActive,
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelectedIds((current) => {
      if (allFilteredSelected) {
        const next = new Set(current);
        filtered.forEach((company) => next.delete(company.id));
        return next;
      }

      return new Set([...current, ...filtered.map((company) => company.id)]);
    });
  }

  function companyMonitors(companyId: string) {
    return monitors.filter((monitor) => monitor.companyId === companyId);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-sm text-muted-foreground">
            Organize customer spaces, review assigned sites, and apply bulk actions across multiple organizations.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search companies" className="pl-9" />
          </div>
          <Button onClick={() => setCreateOpen(true)} className="bg-violet-600 text-white hover:bg-violet-500">
            <Plus className="mr-2 h-4 w-4" />
            Add Company
          </Button>
        </div>
      </header>

      {error ? <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Total Companies" value={String(totals.companies)} sub="Registered organizations" icon={Building2} tone="neutral" />
        <StatCard label="Active Companies" value={String(totals.active)} sub="Available for monitor assignment" icon={Users} tone="green" />
        <StatCard label="Assigned Monitors" value={String(totals.monitors)} sub="Endpoints mapped to companies" icon={Server} tone="red" />
      </div>

      {selectedIds.size > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium">{selectedIds.size} compan{selectedIds.size === 1 ? "y" : "ies"} selected</p>
            <p className="text-xs text-muted-foreground">Apply the same action across the selected organizations.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void handleBulk("activate")} disabled={saving}>Activate</Button>
            <Button variant="outline" size="sm" onClick={() => void handleBulk("deactivate")} disabled={saving}>Deactivate</Button>
            <Button variant="destructive" size="sm" onClick={() => void handleBulk("delete")} disabled={saving}>Delete</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <CardTitle className="text-base">Company Directory</CardTitle>
          <CardDescription>Click a company row to inspect its assigned monitors in a focused detail panel.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-background">
                <TableHead className="w-14 pl-5">
                  <button type="button" onClick={toggleAllFiltered} className="flex items-center justify-center text-muted-foreground">
                    {allFilteredSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                  </button>
                </TableHead>
                <TableHead className="pl-1">Company</TableHead>
                <TableHead>Monitors</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[110px] pr-5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">Loading companies...</TableCell></TableRow> : null}
              {!loading && filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No companies found.</TableCell></TableRow> : null}
              {!loading ? filtered.map((company) => (
                <TableRow key={company.id} className={cn(selectedIds.has(company.id) && "bg-emerald-500/5", "cursor-pointer")} onClick={() => setDetailCompany(company)}>
                  <TableCell className="pl-5" onClick={(event) => event.stopPropagation()}>
                    <button type="button" onClick={() => toggleSelect(company.id)} className="flex items-center justify-center text-muted-foreground transition hover:text-foreground">
                      {selectedIds.has(company.id) ? <CheckSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Square className="h-4 w-4" />}
                    </button>
                  </TableCell>
                  <TableCell className="pl-1">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl border bg-muted/30 p-3">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium">{company.name}</p>
                        <p className="max-w-md text-xs leading-5 text-muted-foreground">{company.description || "No description yet."}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium">{company.monitorsCount}</p>
                      <p className="text-xs text-muted-foreground">{company.activeMonitors} healthy</p>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className={company.isActive ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "border-destructive/30 text-destructive"}>{company.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(company.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="pr-5" onClick={(event) => event.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(company)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => void deleteCompany(company.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              )) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(detailCompany)} onOpenChange={(open) => !open && setDetailCompany(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{detailCompany?.name ?? "Company Monitors"}</DialogTitle>
            <DialogDescription>
              Review assigned sites with search and pagination, similar to monitor settings workflows.
            </DialogDescription>
          </DialogHeader>
          {detailCompany ? <CompanyMonitorsPanel companyId={detailCompany.id} companyName={detailCompany.name} monitors={companyMonitors(detailCompany.id)} /> : null}
        </DialogContent>
      </Dialog>

      <CompanyDialog open={createOpen} title="Add Company" description="Create a reusable organization for monitor assignment." form={form} saving={saving} onOpenChange={(open) => { setCreateOpen(open); if (!open) setForm(DEFAULT_COMPANY_FORM); }} onFormChange={setForm} onSubmit={handleCreate} />
      <CompanyDialog open={Boolean(editing)} title="Edit Company" description="Update the organization details used across monitoring and dashboard views." form={form} saving={saving} onOpenChange={(open) => { if (!open) { setEditing(null); setForm(DEFAULT_COMPANY_FORM); } }} onFormChange={setForm} onSubmit={handleUpdate} />
    </div>
  );
}

function CompanyDialog({ open, title, description, form, saving, onOpenChange, onFormChange, onSubmit }: { open: boolean; title: string; description: string; form: CompanyPayload; saving: boolean; onOpenChange: (open: boolean) => void; onFormChange: Dispatch<SetStateAction<CompanyPayload>>; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>; }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={(event) => void onSubmit(event)} className="space-y-4"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><Field label="Name"><Input value={form.name} onChange={(event) => onFormChange((current) => ({ ...current, name: event.target.value }))} required /></Field><Field label="Description"><Textarea rows={4} value={form.description} onChange={(event) => onFormChange((current) => ({ ...current, description: event.target.value }))} placeholder="Primary customer workspace for production uptime checks." /></Field><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Company"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function StatCard({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub: string; icon: ElementType; tone: "neutral" | "green" | "red" }) {
  return <Card className="overflow-hidden"><CardContent className={`border-l-2 px-4 py-3 ${tone === "green" ? "border-l-emerald-500" : tone === "red" ? "border-l-red-500" : "border-l-slate-400"}`}><div className="flex items-start justify-between gap-3"><div className="space-y-1"><p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p><p className="text-xl font-semibold tracking-tight">{value}</p><p className="text-xs text-muted-foreground">{sub}</p></div><div className="rounded-xl bg-muted/70 p-2.5"><Icon className="h-4 w-4" /></div></div></CardContent></Card>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
