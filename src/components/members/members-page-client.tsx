"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  Mail,
  Pencil,
  Plus,
  Search,
  SearchX,
  ShieldCheck,
  Square,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MemberRecord } from "@/lib/members/types";

type MemberRole = MemberRecord["role"];
type CreateMemberForm = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  department: string;
  password: string;
  confirmPassword: string;
};

const EMPTY_EDIT_FORM = { username: "", email: "" };
const EMPTY_CREATE_FORM: CreateMemberForm = {
  firstName: "",
  lastName: "",
  username: "",
  email: "",
  department: "",
  password: "",
  confirmPassword: "",
};

export default function MembersPageClient() {
  const router = useRouter();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState<MemberRole>("member");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingMember, setEditingMember] = useState<MemberRecord | null>(null);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [createForm, setCreateForm] = useState<CreateMemberForm>(EMPTY_CREATE_FORM);
  const [createOpen, setCreateOpen] = useState(false);

  const isAdmin = currentUserRole === "admin";

  useEffect(() => {
    void loadMembers();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return members;
    }

    return members.filter((member) =>
      [member.firstName, member.lastName, member.email, member.username ?? "", member.organization ?? "", member.role]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [members, search]);

  const totals = {
    members: members.length,
    admins: members.filter((member) => member.role === "admin").length,
    departments: new Set(members.map((member) => member.department).filter(Boolean)).size,
  };
  const selectableFilteredIds = filtered.filter((member) => canSelectMember(member)).map((member) => member.id);
  const allFilteredSelected = selectableFilteredIds.length > 0 && selectableFilteredIds.every((id) => selectedIds.has(id));
  const singleSelected = selectedIds.size === 1 ? members.find((member) => selectedIds.has(member.id)) ?? null : null;

  async function loadMembers() {
    setLoading(true);

    try {
      const response = await fetch("/api/members", { cache: "no-store" });
      const data = (await response.json()) as {
        currentUserId?: string;
        currentUserRole?: MemberRole;
        members?: MemberRecord[];
        message?: string;
      };
      if (!response.ok) {
        throw new Error(data.message ?? "Unable to load members.");
      }

      setCurrentUserId(data.currentUserId ?? "");
      setCurrentUserRole(data.currentUserRole ?? "member");
      setMembers(data.members ?? []);
      setSelectedIds(new Set());
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load members.");
    } finally {
      setLoading(false);
    }
  }

  async function createMember() {
    setSaving(true);

    try {
      const response = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = (await response.json()) as { member?: MemberRecord; message?: string };
      if (!response.ok || !data.member) {
        throw new Error(data.message ?? "Unable to add the member.");
      }

      setMembers((current) => sortMembers([...current, data.member as MemberRecord]));
      setCreateForm(EMPTY_CREATE_FORM);
      setCreateOpen(false);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to add the member.");
    } finally {
      setSaving(false);
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
        body: JSON.stringify(editForm),
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

  function canSelectMember(member: MemberRecord) {
    return isAdmin || member.id === currentUserId;
  }

  function toggleSelect(member: MemberRecord) {
    if (!canSelectMember(member)) {
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(member.id)) {
        next.delete(member.id);
      } else {
        next.add(member.id);
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
    if (!isAdmin && member.id !== currentUserId) {
      setError("You can only edit your own username and email address.");
      return;
    }

    setEditingMember(member);
    setEditForm({
      username: member.username ?? "",
      email: member.email,
    });
  }

  function openDeleteConfirmation(memberIds: string[]) {
    const uniqueIds = Array.from(new Set(memberIds.filter(Boolean)));
    const allowedIds = isAdmin ? uniqueIds : uniqueIds.filter((id) => id === currentUserId);
    if (allowedIds.length === 0) {
      setError(isAdmin ? "Select at least one member." : "You can only delete your own account.");
      return;
    }

    setDeleteTargetIds(allowedIds);
  }

  function closeDeleteConfirmation() {
    if (!saving) {
      setDeleteTargetIds([]);
    }
  }

  const deleteTargets = members.filter((member) => deleteTargetIds.includes(member.id));
  const deleteIncludesCurrentUser = deleteTargets.some((member) => member.id === currentUserId);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-200">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Manage workspace access, add members, and remove accounts."
              : "Review and maintain your own account details."}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:max-w-lg sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search members" className="pl-9" />
          </div>
          {isAdmin ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus data-icon="inline-start" />
              Add member
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => void loadMembers()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </header>

      {error ? <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Visible members" value={String(totals.members)} icon={UsersRound} />
        <MetricCard label="Admins" value={String(totals.admins)} icon={ShieldCheck} />
        <MetricCard label="Departments" value={String(totals.departments)} icon={Mail} />
      </div>

      {selectedIds.size > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-sky-500/15 bg-sky-500/5 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium">{selectedIds.size} member selected</p>
            <p className="text-xs text-muted-foreground">
              {isAdmin ? "Admins can edit or remove selected accounts." : "Edit and deletion actions are limited to your own account."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => singleSelected && openEdit(singleSelected)} disabled={!singleSelected}>
              <Pencil data-icon="inline-start" />
              Edit selected
            </Button>
            <Button variant="destructive" size="sm" onClick={() => openDeleteConfirmation(Array.from(selectedIds))} disabled={saving}>
              <Trash2 data-icon="inline-start" />
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
          <CardTitle className="text-base">Workspace users</CardTitle>
          <CardDescription>
            {isAdmin ? "All members are visible here. New accounts are created by admins." : "Only your own profile is visible here."}
          </CardDescription>
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
                    {allFilteredSelected ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
                  </button>
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Department</TableHead>
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
                  <TableCell colSpan={8}>
                    <EmptyState icon={SearchX} title="No members found" description="Try another search term or refresh the member list." />
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading ? filtered.map((member) => (
                <TableRow key={member.id} className={selectedIds.has(member.id) ? "bg-sky-500/5" : "hover:bg-muted/10"}>
                  <TableCell className="pl-4">
                    <button
                      type="button"
                      onClick={() => toggleSelect(member)}
                      className="flex items-center justify-center text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={!canSelectMember(member)}
                    >
                      {selectedIds.has(member.id) ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl border bg-muted/20 p-2.5">
                        <UserRound className="size-4 text-muted-foreground" />
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
                  <TableCell><RoleBadge role={member.role} /></TableCell>
                  <TableCell>{member.username ?? "--"}</TableCell>
                  <TableCell>{member.department ?? "--"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-border/70 text-muted-foreground">
                      {new Date(member.createdAt).toLocaleDateString()}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-4 text-right md:pr-6">
                    <div className="flex justify-end gap-1 pr-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(member)} disabled={!isAdmin && member.id !== currentUserId}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openDeleteConfirmation([member.id])} disabled={saving || (!isAdmin && member.id !== currentUserId)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateMemberDialog
        open={createOpen}
        form={createForm}
        saving={saving}
        onOpenChange={setCreateOpen}
        onChange={setCreateForm}
        onSubmit={() => void createMember()}
      />

      <Dialog open={Boolean(editingMember)} onOpenChange={(open) => !open && setEditingMember(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit member</DialogTitle>
            <DialogDescription>Update the username and email address used by this workspace user.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <Field label="Username">
              <Input value={editForm.username} onChange={(event) => setEditForm((current) => ({ ...current, username: event.target.value }))} placeholder="operator-name" />
            </Field>
            <Field label="Email">
              <Input type="email" value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMember(null)}>Cancel</Button>
            <Button onClick={() => void saveMember()} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTargetIds.length > 0} onOpenChange={(open) => !open && closeDeleteConfirmation()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete member{deleteTargets.length === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              This action permanently removes the selected account{deleteTargets.length === 1 ? "" : "s"} and related workspace data.
              {deleteIncludesCurrentUser ? " Your current session will be closed immediately after deletion." : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">Please confirm before continuing.</p>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              {deleteTargets.map((member) => (
                <div key={member.id} className="flex min-w-0 flex-col gap-1 rounded-lg border border-border/70 bg-background/80 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span className="font-medium text-foreground">
                    {member.firstName} {member.lastName}
                    {member.id === currentUserId ? " (you)" : ""}
                  </span>
                  <span className="min-w-0 text-xs [overflow-wrap:anywhere]">{member.email}</span>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteConfirmation} disabled={saving}>Cancel</Button>
            <Button variant="destructive" onClick={() => void deleteMembersByIds(deleteTargetIds)} disabled={saving}>
              {saving ? "Deleting..." : `Delete ${deleteTargets.length === 1 ? "member" : "members"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateMemberDialog({
  open,
  form,
  saving,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean;
  form: CreateMemberForm;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (form: CreateMemberForm) => void;
  onSubmit: () => void;
}) {
  function updateField(field: keyof CreateMemberForm, value: string) {
    onChange({ ...form, [field]: value });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>Create a member account. The new user can sign in from the login page.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <Input value={form.firstName} onChange={(event) => updateField("firstName", event.target.value)} />
          </Field>
          <Field label="Last name">
            <Input value={form.lastName} onChange={(event) => updateField("lastName", event.target.value)} />
          </Field>
          <Field label="Username">
            <Input
              value={form.username}
              onChange={(event) => updateField("username", event.target.value)}
              placeholder="operator.name"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} />
          </Field>
          <Field label="Department">
            <Input value={form.department} onChange={(event) => updateField("department", event.target.value)} />
          </Field>
          <Field label="Password">
            <Input type="password" minLength={12} maxLength={128} value={form.password} onChange={(event) => updateField("password", event.target.value)} />
          </Field>
          <Field label="Confirm password">
            <Input type="password" minLength={12} maxLength={128} value={form.confirmPassword} onChange={(event) => updateField("confirmPassword", event.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={onSubmit} disabled={saving}>{saving ? "Creating..." : "Create member"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof UsersRound;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="border-l-2 border-l-slate-400 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tracking-tight">{value}</p>
          </div>
          <div className="rounded-xl bg-muted/70 p-2.5">
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RoleBadge({ role }: { role: MemberRole }) {
  return <Badge variant={role === "admin" ? "default" : "secondary"}>{role === "admin" ? "Admin" : "Member"}</Badge>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function sortMembers(members: MemberRecord[]) {
  return [...members].sort((a, b) => {
    const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
    const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
    return nameA.localeCompare(nameB);
  });
}
