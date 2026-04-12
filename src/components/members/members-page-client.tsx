"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Mail, Pencil, Search, Square, Trash2, UserRound, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MemberRecord } from "@/lib/members/types";

const EMPTY_FORM = { username: "", email: "" };

export default function MembersPageClient() {
  const router = useRouter();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingMember, setEditingMember] = useState<MemberRecord | null>(null);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    void loadMembers();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return members;
    }

    return members.filter((member) =>
      [member.firstName, member.lastName, member.email, member.username ?? "", member.organization ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [members, search]);

  const totals = {
    members: members.length,
    departments: new Set(members.map((member) => member.department).filter(Boolean)).size,
    organizations: new Set(members.map((member) => member.organization).filter(Boolean)).size,
  };
  const selectableFilteredIds = filtered.map((member) => member.id);

  const allFilteredSelected = selectableFilteredIds.length > 0 && selectableFilteredIds.every((id) => selectedIds.has(id));
  const singleSelected = selectedIds.size === 1 ? members.find((member) => selectedIds.has(member.id)) ?? null : null;

  async function loadMembers() {
    setLoading(true);

    try {
      const response = await fetch("/api/members", { cache: "no-store" });
      const data = (await response.json()) as { currentUserId?: string; members?: MemberRecord[]; message?: string };
      if (!response.ok) {
        throw new Error(data.message ?? "Unable to load members.");
      }

      setCurrentUserId(data.currentUserId ?? "");
      setMembers(data.members ?? []);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load members.");
    } finally {
      setLoading(false);
    }
  }

  async function saveMember() {
    if (!editingMember) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`/api/members/${editingMember.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as { member?: MemberRecord; message?: string };
      if (!response.ok || !data.member) {
        throw new Error(data.message ?? "Unable to update the member.");
      }

      setMembers((current) => current.map((member) => (member.id === data.member?.id ? data.member : member)));
      setEditingMember(null);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update the member.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMembersByIds(memberIds: string[]) {
    if (memberIds.length === 0) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: memberIds }),
      });
      const data = (await response.json()) as { ids?: string[]; message?: string; signedOut?: boolean };
      if (!response.ok || !data.ids) {
        throw new Error(data.message ?? "Unable to delete the selected members.");
      }

      const deleted = new Set(data.ids);
      setMembers((current) => current.filter((member) => !deleted.has(member.id)));
      setSelectedIds(new Set());
      setDeleteTargetIds([]);
      setError(null);

      if (data.signedOut) {
        router.replace("/login?message=account-removed");
        router.refresh();
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to delete the selected members.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteTargets() {
    await deleteMembersByIds(deleteTargetIds);
  }

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelectedIds((current) => {
      if (allFilteredSelected) {
        const next = new Set(current);
        selectableFilteredIds.forEach((id) => next.delete(id));
        return next;
      }

      return new Set([...current, ...selectableFilteredIds]);
    });
  }

  function openEdit(member: MemberRecord) {
    if (member.id !== currentUserId) {
      setError("You can only edit your own username and email address.");
      return;
    }

    setEditingMember(member);
    setForm({
      username: member.username ?? "",
      email: member.email,
    });
  }

  function openDeleteConfirmation(memberIds: string[]) {
    const uniqueIds = Array.from(new Set(memberIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return;
    }

    setDeleteTargetIds(uniqueIds);
  }

  function closeDeleteConfirmation() {
    if (saving) {
      return;
    }

    setDeleteTargetIds([]);
  }

  const deleteTargets = members.filter((member) => deleteTargetIds.includes(member.id));
  const deleteIncludesCurrentUser = deleteTargets.some((member) => member.id === currentUserId);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">
            Review all registered users from one place. Account details stay self-editable, and workspace members can be removed from here.
          </p>
        </div>
        <div className="flex w-full max-w-sm items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search members" className="pl-9" />
          </div>
          <Button variant="outline" onClick={() => void loadMembers()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </header>

      {error ? <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Total members" value={String(totals.members)} icon={UsersRound} tone="neutral" />
        <MetricCard label="Departments" value={String(totals.departments)} icon={UserRound} tone="green" />
        <MetricCard label="Organizations" value={String(totals.organizations)} icon={Mail} tone="amber" />
      </div>

      {selectedIds.size > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-sky-500/15 bg-sky-500/5 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium">{selectedIds.size} member selected</p>
            <p className="text-xs text-muted-foreground">Edit remains self-service, while deletion is available for selected workspace members.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => singleSelected && openEdit(singleSelected)} disabled={!singleSelected}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit selected
            </Button>
            <Button variant="destructive" size="sm" onClick={() => openDeleteConfirmation(Array.from(selectedIds))} disabled={saving}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete selected
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/10 pb-4">
          <CardTitle className="text-base">Registered users</CardTitle>
          <CardDescription>All members are visible here. Editing is limited to your own account, while member removal is available from the list.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="w-14 pl-4">
                  <button
                    type="button"
                    onClick={toggleAllFiltered}
                    className="flex items-center justify-center text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={selectableFilteredIds.length === 0}
                  >
                    {allFilteredSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                  </button>
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-28 pr-6 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">Loading members...</TableCell>
                </TableRow>
              ) : null}
              {!loading && filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">No members found.</TableCell>
                </TableRow>
              ) : null}
              {!loading ? filtered.map((member) => (
                <TableRow key={member.id} className={selectedIds.has(member.id) ? "bg-sky-500/5" : "hover:bg-muted/10"}>
                  <TableCell className="pl-4">
                    <button
                      type="button"
                      onClick={() => toggleSelect(member.id)}
                      className="flex items-center justify-center text-muted-foreground"
                    >
                      {selectedIds.has(member.id) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl border bg-muted/20 p-2.5">
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{member.firstName} {member.lastName}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.id === currentUserId ? "Your account" : member.jobTitle ?? "Workspace member"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>{member.username ?? "--"}</TableCell>
                  <TableCell>{member.department ?? "--"}</TableCell>
                  <TableCell>{member.organization ?? "--"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-border/70 text-muted-foreground">
                      {new Date(member.createdAt).toLocaleDateString()}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-4 text-right md:pr-6">
                    <div className="flex justify-end gap-1 pr-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(member)}
                        disabled={member.id !== currentUserId}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDeleteConfirmation([member.id])}
                        disabled={saving}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(editingMember)} onOpenChange={(open) => !open && setEditingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit member</DialogTitle>
            <DialogDescription>Update the username and email address used by this workspace user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Username">
              <Input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} placeholder="operator-name" />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMember(null)}>Cancel</Button>
            <Button onClick={() => void saveMember()} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTargetIds.length > 0} onOpenChange={(open) => !open && closeDeleteConfirmation()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete member{deleteTargets.length === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              This action permanently removes the selected account{deleteTargets.length === 1 ? "" : "s"} and related workspace data.
              {deleteIncludesCurrentUser ? " Your current session will be closed immediately after deletion." : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">Please confirm before continuing.</p>
            <div className="space-y-2 text-sm text-muted-foreground">
              {deleteTargets.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/80 px-3 py-2">
                  <span className="font-medium text-foreground">
                    {member.firstName} {member.lastName}
                    {member.id === currentUserId ? " (you)" : ""}
                  </span>
                  <span className="truncate text-xs">{member.email}</span>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteConfirmation} disabled={saving}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDeleteTargets()} disabled={saving}>
              {saving ? "Deleting..." : `Delete ${deleteTargets.length === 1 ? "member" : "members"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof UsersRound;
  tone: "neutral" | "green" | "amber";
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className={`border-l-2 px-4 py-3 ${tone === "green" ? "border-l-emerald-500" : tone === "amber" ? "border-l-amber-500" : "border-l-slate-400"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tracking-tight">{value}</p>
          </div>
          <div className="rounded-xl bg-muted/70 p-2.5">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
