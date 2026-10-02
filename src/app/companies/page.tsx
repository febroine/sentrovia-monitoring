"use client";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { CheckSquare, Pencil, Plus, Search, Square, Trash2, Undo2 } from "lucide-react";
import { CompanyMonitorsPanel } from "@/components/companies/company-monitors-panel";
import { CompanyRecipientScopes } from "@/components/companies/company-recipient-scopes";
import { useUnsavedChangesGuard } from "@/components/ui/unsaved-changes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormAlert } from "@/components/ui/form-alert";
import { showToast } from "@/lib/client-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_COMPANY_FORM, type CompanyPayload, type CompanyRecord } from "@/lib/companies/types";
import type { MonitorRecord } from "@/lib/monitors/types";
import { formatPanelDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { parseSoftDeleteUndoDeadline } from "@/lib/soft-delete";
import { useCompaniesStore } from "@/stores/use-companies-store";

type PendingCompanyRestore = { ids: string[]; expiresAt: number };
type CompanyDeleteRequest = { ids: string[]; names: string[]; monitorsCount: number };

export default function CompaniesPage() {
  const { companies, loading, saving, error, loadCompanies, createCompany, updateCompany, deleteCompany, bulkAction, restoreCompanies, clearError } =
    useCompaniesStore();
  // Why the open add or edit dialog could not be saved, shown inside it.
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<CompanyPayload>(DEFAULT_COMPANY_FORM);
  // The form as it was opened, to tell whether closing would lose edits.
  const [formSnapshot, setFormSnapshot] = useState<CompanyPayload>(DEFAULT_COMPANY_FORM);
  const { setDirty: setCompanyFormDirty, guardClose: guardCompanyFormClose, confirmDialog: companyFormDiscardDialog } = useUnsavedChangesGuard();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailCompany, setDetailCompany] = useState<CompanyRecord | null>(null);
  const [monitors, setMonitors] = useState<MonitorRecord[]>([]);
  const [pendingRestores, setPendingRestores] = useState<PendingCompanyRestore[]>([]);
  const [deleteRequest, setDeleteRequest] = useState<CompanyDeleteRequest | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedSearch = params.get("search")?.trim();
    const frameId = window.requestAnimationFrame(() => {
      if (requestedSearch) setSearch(requestedSearch);
      if (params.get("create") === "1") setCreateOpen(true);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

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

  useEffect(() => {
    if (pendingRestores.length === 0) return;
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setPendingRestores((current) => {
        const active = current.filter((item) => item.expiresAt > now);
        return active.length === current.length ? current : active;
      });
    }, 500);
    return () => window.clearInterval(intervalId);
  }, [pendingRestores.length]);

  const filtered = useMemo(
    () => companies.filter((company) => !search.trim() || company.name.toLowerCase().includes(search.trim().toLowerCase())),
    [companies, search]
  );

  const totals = {
    companies: companies.length,
    active: companies.filter((company) => company.isActive).length,
    monitors: companies.reduce((sum, company) => sum + company.monitorsCount, 0),
  };

  useEffect(() => {
    setCompanyFormDirty(JSON.stringify(form) !== JSON.stringify(formSnapshot));
  }, [form, formSnapshot, setCompanyFormDirty]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((company) => selectedIds.has(company.id));

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDialogError(null);
    const created = await createCompany(form);
    if (created) {
      setForm(DEFAULT_COMPANY_FORM);
      setFormSnapshot(DEFAULT_COMPANY_FORM);
      setCreateOpen(false);
      showToast(`${created.name} was added.`, "success");
    } else {
      takeStoreErrorIntoDialog();
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setDialogError(null);
    const updated = await updateCompany(editing.id, form);
    if (updated) {
      setEditing(null);
      setForm(DEFAULT_COMPANY_FORM);
      setFormSnapshot(DEFAULT_COMPANY_FORM);
      showToast("Company updated.", "success");
    } else {
      takeStoreErrorIntoDialog();
    }
  }

  // The store keeps the error for the page banner, which an open dialog covers; show it in the dialog.
  function takeStoreErrorIntoDialog() {
    setDialogError(useCompaniesStore.getState().error ?? "The company could not be saved.");
    clearError();
  }

  async function handleBulk(action: "activate" | "deactivate" | "delete") {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const result = await bulkAction(action, ids);
    if (result) {
      setSelectedIds(new Set());
      if (action === "delete" && result.ids.length > 0) {
        setPendingRestores((current) => [
          ...current,
          { ids: result.ids, expiresAt: parseSoftDeleteUndoDeadline(result.undoUntil) },
        ]);
      }
    }
  }

  async function handleDeleteCompany(id: string) {
    const result = await deleteCompany(id);
    if (result) {
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setPendingRestores((current) => [
        ...current,
        { ids: result.ids, expiresAt: parseSoftDeleteUndoDeadline(result.undoUntil) },
      ]);
    }
  }

  function requestCompanyDeletion(targets: CompanyRecord[]) {
    setDeleteRequest({
      ids: targets.map((company) => company.id),
      names: targets.map((company) => company.name),
      monitorsCount: targets.reduce((sum, company) => sum + company.monitorsCount, 0),
    });
  }

  async function confirmCompanyDeletion() {
    if (!deleteRequest) return;

    if (deleteRequest.ids.length === 1) {
      await handleDeleteCompany(deleteRequest.ids[0]);
    } else {
      await handleBulk("delete");
    }
    setDeleteRequest(null);
  }

  async function undoCompanyDeletion() {
    const ids = pendingRestores.flatMap((item) => item.ids);
    if (ids.length === 0) return;
    if (await restoreCompanies(ids)) {
      setPendingRestores([]);
    }
  }

  // Each dialog opens without the previous attempt's error.
  function openCreateDialog() {
    setDialogError(null);
    setCreateOpen(true);
  }

  function openEdit(company: CompanyRecord) {
    setDialogError(null);
    setEditing(company);
    const nextForm: CompanyPayload = {
      name: company.name,
      description: company.description ?? "",
      notificationEmailRecipients: company.notificationEmailRecipients.join(", "),
      notificationEmailScopes: company.notificationEmailScopes ?? {},
      telegramBotToken: "",
      telegramBotTokenConfigured: company.telegramBotTokenConfigured,
      telegramChatId: company.telegramChatId,
      isActive: company.isActive,
    };
    setForm(nextForm);
    setFormSnapshot(nextForm);
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
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-sm text-muted-foreground">
            Group monitors by customer or operating unit.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search companies" className="pl-9" />
          </div>
          <Button onClick={() => openCreateDialog()}>
            <Plus data-icon="inline-start" className="h-4 w-4" />
            Add company
          </Button>
        </div>
      </header>

      {error ? <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}

      {pendingRestores.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-md bg-emerald-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="status">
          <div>
            <p className="text-sm font-medium">{pendingRestores.flatMap((item) => item.ids).length} compan{pendingRestores.flatMap((item) => item.ids).length === 1 ? "y" : "ies"} deleted</p>
            <p className="mt-1 text-xs text-muted-foreground">Company assignments remain recoverable for 60 seconds.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void undoCompanyDeletion()} disabled={saving}>
            <Undo2 data-icon="inline-start" className="h-4 w-4" /> Restore
          </Button>
        </div>
      ) : null}

      <p className="rounded-md bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        {totals.companies} compan{totals.companies === 1 ? "y" : "ies"} · {totals.active} active · {totals.monitors} assigned monitor{totals.monitors === 1 ? "" : "s"}
      </p>

      {selectedIds.size > 0 ? (
        <div className="flex flex-col gap-3 rounded-md bg-primary/10 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium">{selectedIds.size} compan{selectedIds.size === 1 ? "y" : "ies"} selected</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void handleBulk("activate")} disabled={saving}>Activate</Button>
            <Button variant="outline" size="sm" onClick={() => void handleBulk("deactivate")} disabled={saving}>Deactivate</Button>
            <Button variant="destructive" size="sm" onClick={() => requestCompanyDeletion(companies.filter((company) => selectedIds.has(company.id)))} disabled={saving}>Delete</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        </div>
      ) : null}

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="relative p-0">
          {loading && filtered.length > 0 ? <p role="status" className="absolute right-2 top-2 z-10 rounded-md border border-border bg-background px-3 py-1 text-xs text-muted-foreground">Updating companies…</p> : null}
          <div aria-busy={loading} inert={loading && filtered.length > 0}>
          <Table className="min-w-0 lg:min-w-max">
            <TableHeader>
              <TableRow className="bg-background">
                <TableHead className="w-14 pl-5">
                  <button
                    type="button"
                    onClick={toggleAllFiltered}
                    aria-label={allFilteredSelected ? "Clear visible company selection" : "Select all visible companies"}
                    className="-m-2 flex items-center justify-center rounded-sm p-2 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    {allFilteredSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                  </button>
                </TableHead>
                <TableHead className="pl-1">Company</TableHead>
                <TableHead>Monitors</TableHead>
                {/* Narrow screens keep the company, its monitors and the actions in view. */}
                <TableHead className="hidden lg:table-cell">Status</TableHead>
                <TableHead className="hidden lg:table-cell">Created</TableHead>
                <TableHead className="pr-5 text-right lg:w-[160px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Loading companies…</TableCell></TableRow> : null}
              {!loading && filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState
                      title={search.trim() ? "No companies match this search" : "No companies yet"}
                      description={search.trim() ? "Clear the search to return to every company." : "Create a company when monitors need shared ownership or notification recipients."}
                      action={search.trim() ? (
                        <Button variant="outline" size="sm" onClick={() => setSearch("")}>Clear search</Button>
                      ) : (
                        <Button size="sm" onClick={() => openCreateDialog()}>Add first company</Button>
                      )}
                    />
                  </TableCell>
                </TableRow>
              ) : null}
              {filtered.length > 0 ? filtered.map((company) => (
                <TableRow key={company.id} className={cn(selectedIds.has(company.id) && "bg-primary/5")}>
                  <TableCell className="pl-5">
                    <button
                      type="button"
                      onClick={() => toggleSelect(company.id)}
                      aria-label={selectedIds.has(company.id) ? `Deselect ${company.name}` : `Select ${company.name}`}
                      className="-m-2 flex items-center justify-center rounded-sm p-2 text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      {selectedIds.has(company.id) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                    </button>
                  </TableCell>
                  <TableCell className="whitespace-normal pl-1">
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => setDetailCompany(company)}
                        className="rounded-sm text-left font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        {company.name}
                      </button>
                      {company.description ? <p className="max-w-md text-xs leading-5 text-muted-foreground">{company.description}</p> : null}
                      {!company.isActive ? <p className="text-xs font-medium text-destructive lg:hidden">Inactive</p> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium">{company.monitorsCount}</p>
                      <p className="text-xs text-muted-foreground">{company.activeMonitors} active</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell"><Badge variant="outline" className={company.isActive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}>{company.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{formatPanelDateTime(company.createdAt, { dateStyle: "short" })}</TableCell>
                  <TableCell className="pr-5">
                    <div className="flex justify-end gap-1.5">
                      <Button variant="ghost" size="sm" className="hidden lg:inline-flex" onClick={() => setDetailCompany(company)}>View</Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${company.name}`} title="Edit company" onClick={() => openEdit(company)}><Pencil className="h-4 w-4" /></Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${company.name}`}
                        onClick={() => requestCompanyDeletion([company])}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )) : null}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(detailCompany)} onOpenChange={(open) => !open && setDetailCompany(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{detailCompany?.name ?? "Company Monitors"}</DialogTitle>
            <DialogDescription>
              Search and review monitors assigned to this company.
            </DialogDescription>
          </DialogHeader>
          {detailCompany ? <CompanyMonitorsPanel companyId={detailCompany.id} companyName={detailCompany.name} monitors={companyMonitors(detailCompany.id)} company={companies.find((company) => company.id === detailCompany.id) ?? detailCompany} /> : null}
        </DialogContent>
      </Dialog>

      {companyFormDiscardDialog}
      <CompanyDialog open={createOpen} title="Add company" description="Group monitors and set company-level notification recipients." form={form} saving={saving} error={dialogError} onOpenChange={(open) => {
        if (open) {
          setFormSnapshot(DEFAULT_COMPANY_FORM);
          openCreateDialog();
          return;
        }
        guardCompanyFormClose(() => {
          setCreateOpen(false);
          setForm(DEFAULT_COMPANY_FORM);
          setFormSnapshot(DEFAULT_COMPANY_FORM);
        });
      }} onFormChange={setForm} onSubmit={handleCreate} />
      <CompanyDialog open={Boolean(editing)} title="Edit company" description="Change company details and notification recipients." form={form} saving={saving} error={dialogError} monitors={editing ? companyMonitors(editing.id) : undefined} onOpenChange={(open) => {
        if (open) return;
        guardCompanyFormClose(() => {
          setEditing(null);
          setForm(DEFAULT_COMPANY_FORM);
          setFormSnapshot(DEFAULT_COMPANY_FORM);
        });
      }} onFormChange={setForm} onSubmit={handleUpdate} />

      <Dialog open={Boolean(deleteRequest)} onOpenChange={(open) => !open && setDeleteRequest(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {deleteRequest?.ids.length === 1 ? deleteRequest.names[0] : `${deleteRequest?.ids.length ?? 0} companies`}?</DialogTitle>
            <DialogDescription>
              {deleteRequest?.monitorsCount
                ? `${deleteRequest.monitorsCount} assigned monitor${deleteRequest.monitorsCount === 1 ? "" : "s"} will become unassigned. You can restore the deletion for 60 seconds.`
                : "You can restore the deletion for 60 seconds."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteRequest(null)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={saving} onClick={() => void confirmCompanyDeletion()}>
              {saving ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CompanyDialog({
  open,
  title,
  description,
  form,
  saving,
  monitors,
  onOpenChange,
  onFormChange,
  onSubmit,
  error,
}: {
  open: boolean;
  title: string;
  description: string;
  form: CompanyPayload;
  saving: boolean;
  error: string | null;
  // The company's monitors when editing; a new company has none.
  monitors?: MonitorRecord[];
  onOpenChange: (open: boolean) => void;
  onFormChange: Dispatch<SetStateAction<CompanyPayload>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(event) =>
                onFormChange((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </Field>
          <Field label="Description">
            <Textarea
              rows={4}
              value={form.description}
              onChange={(event) =>
                onFormChange((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Production services"
            />
          </Field>
          <div className="rounded-md bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Notification recipients</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Assigned monitors send alerts here when the matching notification channel is enabled. Monitor recipients also receive alerts.
                </p>
              </div>
              {form.telegramBotTokenConfigured ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onFormChange((current) => ({
                    ...current,
                    telegramBotToken: "",
                    telegramBotTokenConfigured: false,
                    telegramChatId: "",
                  }))}
                >
                  Clear Telegram
                </Button>
              ) : null}
            </div>
            <div className="mt-4 space-y-4">
              <Field label="Email recipients">
                <Textarea
                  rows={3}
                  value={form.notificationEmailRecipients}
                  onChange={(event) => onFormChange((current) => ({
                    ...current,
                    notificationEmailRecipients: event.target.value,
                  }))}
                  placeholder="oncall@example.com, noc@example.com"
                />
              </Field>
              <CompanyRecipientScopes
                recipientsText={form.notificationEmailRecipients}
                scopes={form.notificationEmailScopes}
                monitors={monitors}
                onChange={(notificationEmailScopes) => onFormChange((current) => ({ ...current, notificationEmailScopes }))}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Telegram bot token">
                  <Input
                    type="password"
                    value={form.telegramBotToken}
                    onChange={(event) => onFormChange((current) => ({
                      ...current,
                      telegramBotToken: event.target.value,
                      telegramBotTokenConfigured: event.target.value.trim()
                        ? true
                        : current.telegramBotTokenConfigured,
                    }))}
                    placeholder={form.telegramBotTokenConfigured ? "Stored securely" : "123456:ABC…"}
                  />
                </Field>
                <Field label="Telegram chat ID">
                  <Input
                    value={form.telegramChatId}
                    onChange={(event) => onFormChange((current) => ({
                      ...current,
                      telegramChatId: event.target.value,
                    }))}
                    placeholder="-1001234567890"
                  />
                </Field>
              </div>
            </div>
          </div>
          <FormAlert message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save company"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
