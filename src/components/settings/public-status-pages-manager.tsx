"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Pencil, Plus, RadioTower, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/settings/settings-section-primitives";
import { showToast } from "@/lib/client-toast";
import { normalizePublicStatusSlug } from "@/lib/public-status/schemas";
import type { PublicStatusPageRecord } from "@/lib/public-status/types";

type CompanyOption = {
  id: string;
  name: string;
  monitorsCount: number;
};

type PageDraft = {
  companyId: string;
  slug: string;
  title: string;
  summary: string;
  isEnabled: boolean;
};

const WORKSPACE_SCOPE = "workspace";
const EMPTY_DRAFT: PageDraft = {
  companyId: WORKSPACE_SCOPE,
  slug: "",
  title: "",
  summary: "",
  isEnabled: true,
};

export function PublicStatusSettingsTab({ canManage }: { canManage: boolean }) {
  const [pages, setPages] = useState<PublicStatusPageRecord[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingPage, setEditingPage] = useState<PublicStatusPageRecord | null>(null);
  const [pageToDelete, setPageToDelete] = useState<PublicStatusPageRecord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<PageDraft>(EMPTY_DRAFT);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pagesResponse, companiesResponse] = await Promise.all([
        fetch("/api/public-status-pages", { cache: "no-store" }),
        fetch("/api/companies", { cache: "no-store" }),
      ]);
      const pagesData = await readApiResponse<{ pages?: PublicStatusPageRecord[] }>(pagesResponse);
      const companiesData = await readApiResponse<{ companies?: CompanyOption[] }>(companiesResponse);

      setPages(pagesData.pages ?? []);
      setCompanies(companiesData.companies ?? []);
      setError(null);
    } catch (loadError) {
      setError(toErrorMessage(loadError, "Unable to load public status pages."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const availableScopes = useMemo(
    () => getAvailableScopes(companies, pages, editingPage?.id ?? null),
    [companies, editingPage?.id, pages]
  );

  function openCreateDialog() {
    const initialScope = availableScopes[0] ?? null;
    if (!initialScope) {
      showToast("Every company and the workspace already have a public status page.", "error");
      return;
    }

    setEditingPage(null);
    setDraft({
      ...EMPTY_DRAFT,
      companyId: initialScope.id,
      slug: normalizePublicStatusSlug(`${initialScope.name}-status`).slice(0, 120),
    });
    setDialogOpen(true);
  }

  function openEditDialog(page: PublicStatusPageRecord) {
    setEditingPage(page);
    setDraft({
      companyId: page.companyId ?? WORKSPACE_SCOPE,
      slug: page.slug,
      title: page.title,
      summary: page.summary,
      isEnabled: page.isEnabled,
    });
    setDialogOpen(true);
  }

  async function savePage() {
    if (!canManage || saving) {
      return;
    }

    setSaving(true);
    try {
      const endpoint = editingPage
        ? `/api/public-status-pages/${editingPage.id}`
        : "/api/public-status-pages";
      const response = await fetch(endpoint, {
        method: editingPage ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          companyId: draft.companyId === WORKSPACE_SCOPE ? null : draft.companyId,
        }),
      });
      await readApiResponse<{ page?: PublicStatusPageRecord }>(response);

      setDialogOpen(false);
      showToast(editingPage ? "Public status page updated." : "Public status page created.", "success");
      await loadData();
    } catch (saveError) {
      showToast(toErrorMessage(saveError, "Unable to save the public status page."), "error");
    } finally {
      setSaving(false);
    }
  }

  async function deletePage() {
    if (!canManage || !pageToDelete || saving) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/public-status-pages/${pageToDelete.id}`, { method: "DELETE" });
      await readApiResponse<{ id?: string }>(response);
      setPages((current) => current.filter((page) => page.id !== pageToDelete.id));
      setPageToDelete(null);
      showToast("Public status page deleted.", "success");
    } catch (deleteError) {
      showToast(toErrorMessage(deleteError, "Unable to delete the public status page."), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SectionCard
        title="Public status pages"
        description="Publish company-specific or workspace-wide status pages."
        icon={RadioTower}
        iconClassName="text-sky-600 dark:text-sky-400"
        action={
          <Button
            type="button"
            size="sm"
            onClick={openCreateDialog}
            disabled={!canManage || loading || availableScopes.length === 0}
          >
            <Plus className="size-4" />
            Add page
          </Button>
        }
      >
        {loading ? <p className="border-y py-6 text-sm text-muted-foreground">Loading pages...</p> : null}
        {!loading && error ? (
          <div className="border-l-2 border-destructive px-4 py-2 text-sm text-destructive">
            {error}
            <Button type="button" variant="link" size="sm" className="ml-2 h-auto p-0" onClick={() => void loadData()}>
              Retry
            </Button>
          </div>
        ) : null}
        {!loading && !error && pages.length === 0 ? (
          <p className="border-y py-6 text-sm text-muted-foreground">No public status pages</p>
        ) : null}
        {!loading && !error && pages.length > 0 ? (
          <div className="divide-y border-y">
            {pages.map((page) => (
              <PublicStatusPageRow
                key={page.id}
                page={page}
                canManage={canManage}
                onEdit={() => openEditDialog(page)}
                onDelete={() => setPageToDelete(page)}
              />
            ))}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Only active monitors marked for publication appear. Company pages never expose monitors from another company.
        </p>
      </SectionCard>

      <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPage ? "Edit public status page" : "Add public status page"}</DialogTitle>
            <DialogDescription>Choose the scope and public URL for this page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Company scope</Label>
              <Select
                value={draft.companyId}
                onValueChange={(value) => setDraft((current) => ({ ...current, companyId: String(value) }))}
              >
                <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {availableScopes.map((scope) => (
                    <SelectItem key={scope.id} value={scope.id}>
                      {scope.name}{scope.monitorsCount === null ? "" : ` (${scope.monitorsCount} monitors)`}
                    </SelectItem>
                  ))}
                  {editingPage && !availableScopes.some((scope) => scope.id === draft.companyId) ? (
                    <SelectItem value={draft.companyId}>Unavailable selected company</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="public-status-slug">Status page slug</Label>
              <Input
                id="public-status-slug"
                value={draft.slug}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  slug: normalizePublicStatusSlug(event.target.value).slice(0, 120),
                }))}
                placeholder="company-status"
              />
              <p className="text-xs text-muted-foreground">Public URL: /status/{draft.slug || "company-status"}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="public-status-title">Page title</Label>
              <Input
                id="public-status-title"
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="Leave empty to use the company name"
                maxLength={160}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="public-status-summary">Summary</Label>
              <Textarea
                id="public-status-summary"
                value={draft.summary}
                onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
                placeholder="Live service availability and active incidents."
                maxLength={500}
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between gap-4 border-y py-3">
              <div>
                <p className="text-sm font-medium">Published</p>
                <p className="mt-0.5 text-xs text-muted-foreground">The public URL responds only while this is enabled.</p>
              </div>
              <Switch
                aria-label="Published"
                checked={draft.isEnabled}
                onCheckedChange={(checked) => setDraft((current) => ({ ...current, isEnabled: checked }))}
              />
            </div>
          </div>
          <DialogFooter showCloseButton>
            <Button type="button" onClick={() => void savePage()} disabled={!canManage || saving || draft.slug.length < 3}>
              {saving ? "Saving..." : editingPage ? "Save changes" : "Create page"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pageToDelete)} onOpenChange={(open) => !saving && !open && setPageToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete public status page?</DialogTitle>
            <DialogDescription>
              The URL /status/{pageToDelete?.slug} will stop working. Monitor data is not deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <Button type="button" variant="destructive" onClick={() => void deletePage()} disabled={!canManage || saving}>
              {saving ? "Deleting..." : "Delete page"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PublicStatusPageRow({
  page,
  canManage,
  onEdit,
  onDelete,
}: {
  page: PublicStatusPageRecord;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const published = page.isEnabled && page.companyAvailable;

  return (
    <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="truncate text-sm font-medium">{page.companyName ?? (page.companyId ? "Unavailable company" : "All companies")}</p>
          <span className={published ? "text-xs text-emerald-600 dark:text-emerald-400" : "text-xs text-muted-foreground"}>
            {published ? "Published" : page.isEnabled ? "Company unavailable" : "Paused"}
          </span>
        </div>
        <p className="mt-1 truncate text-sm text-muted-foreground">/status/{page.slug}</p>
        {page.title ? <p className="mt-1 truncate text-xs text-muted-foreground">{page.title}</p> : null}
      </div>
      <div className="flex items-center gap-1 sm:justify-end">
        {published ? (
          <Button type="button" variant="ghost" size="icon-sm" render={<a href={`/status/${page.slug}`} target="_blank" rel="noreferrer" />}>
            <ExternalLink />
            <span className="sr-only">Open {page.slug}</span>
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon-sm" onClick={onEdit} disabled={!canManage}>
          <Pencil />
          <span className="sr-only">Edit {page.slug}</span>
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete} disabled={!canManage}>
          <Trash2 />
          <span className="sr-only">Delete {page.slug}</span>
        </Button>
      </div>
    </div>
  );
}

function getAvailableScopes(
  companies: CompanyOption[],
  pages: PublicStatusPageRecord[],
  editingPageId: string | null
) {
  const occupiedCompanyIds = new Set(
    pages
      .filter((page) => page.id !== editingPageId)
      .map((page) => page.companyId ?? WORKSPACE_SCOPE)
  );
  const scopes: Array<{ id: string; name: string; monitorsCount: number | null }> = companies
    .filter((company) => !occupiedCompanyIds.has(company.id))
    .map((company) => ({ id: company.id, name: company.name, monitorsCount: company.monitorsCount }));

  if (!occupiedCompanyIds.has(WORKSPACE_SCOPE)) {
    scopes.push({ id: WORKSPACE_SCOPE, name: "All companies", monitorsCount: null });
  }

  return scopes;
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null) as (T & { message?: string }) | null;
  if (!response.ok || !data) {
    throw new Error(data?.message ?? "The server could not complete the request.");
  }
  return data;
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
