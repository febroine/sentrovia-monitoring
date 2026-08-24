"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Clipboard, ExternalLink, RefreshCw, Terminal } from "lucide-react";
import { SectionCard } from "@/components/settings/settings-section-primitives";
import { Button } from "@/components/ui/button";

type UpdateStatus = {
  currentVersion: string;
  repository: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  releaseName: string | null;
  publishedAt: string | null;
  notes: string | null;
  checkedAt: string;
  status: "ok" | "error" | "unconfigured";
  message: string;
  recommendedCommands: string[];
  dockerCommands: string[];
  serviceCommands: string[];
  backupReminder: string;
  requiresManualAction: boolean;
};

type UpdateInstallProfile = "docker" | "service";

export function UpdateAssistantTab() {
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [installProfile, setInstallProfile] = useState<UpdateInstallProfile>("docker");
  const [copiedProfile, setCopiedProfile] = useState<UpdateInstallProfile | null>(null);

  async function loadUpdateStatus() {
    setLoading(true);
    try {
      const response = await fetch("/api/updates", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { update?: UpdateStatus; message?: string };
      if (!response.ok) throw new Error(data.message ?? "Unable to check for updates.");
      setUpdate(data.update ?? null);
      setMessage(null);
    } catch (error) {
      setUpdate(null);
      setMessage(error instanceof Error ? error.message : "Unable to check for updates.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUpdateStatus();
  }, []);

  const selectedCommands = update?.status === "ok"
    ? installProfile === "docker" ? update.dockerCommands : update.serviceCommands
    : [];
  const showGuidance = Boolean(
    update?.status === "ok" && update.updateAvailable && update.latestVersion && update.requiresManualAction
  );

  async function copySelectedCommands() {
    if (selectedCommands.length === 0) return;
    try {
      await copyText(selectedCommands.join("\n"));
      setCopiedProfile(installProfile);
      window.setTimeout(() => setCopiedProfile(null), 1800);
    } catch {
      setMessage("Unable to copy commands. Select the command block manually.");
    }
  }

  return (
    <SectionCard title="Update Assistant" description="Check the latest GitHub release and follow safe host-side update commands.">
      {message ? <div className="border-l-2 border-border px-4 py-2 text-sm">{message}</div> : null}
      <dl className="grid border-y md:grid-cols-3 md:divide-x">
        <UpdateMetric label="Installed" value={update?.currentVersion ?? "-"} />
        <UpdateMetric label="Latest" value={update?.latestVersion ?? "-"} />
        <UpdateMetric label="Status" value={resolveUpdateStatusLabel(update, loading)} />
      </dl>
      <UpdateStatusBanner update={update} loading={loading} />
      {update?.backupReminder ? (
        <div className="border-l-2 border-amber-500 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
          {update.backupReminder}
        </div>
      ) : null}
      <ReleaseNotes update={update} />
      {update?.status === "unconfigured" ? <RepositoryHint /> : null}
      {showGuidance ? (
        <div className="space-y-3 border-y py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium">Host-side update commands</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Run these commands on the server that hosts Sentrovia.
              </p>
            </div>
            <ProfileSelector value={installProfile} onChange={setInstallProfile} />
          </div>
          <CommandBlock
            commands={selectedCommands}
            copied={copiedProfile === installProfile}
            description={resolveProfileDescription(installProfile)}
            onCopy={() => void copySelectedCommands()}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void loadUpdateStatus()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
        {update?.releaseUrl ? (
          <a href={update.releaseUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-muted">
            <ExternalLink className="h-4 w-4" /> Open Release
          </a>
        ) : null}
      </div>
    </SectionCard>
  );
}

function UpdateStatusBanner({ update, loading }: { update: UpdateStatus | null; loading: boolean }) {
  const detail = loading ? "Checking GitHub Releases..." : update?.message ?? "Release information is unavailable.";
  const className = update?.updateAvailable
    ? "border-primary/30 bg-primary/10 text-primary-foreground"
    : update?.status === "error" || update?.status === "unconfigured"
      ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";

  return (
    <div className={`border-l-2 px-4 py-2 text-sm ${className}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium">{resolveUpdateStatusLabel(update, loading)}</p>
        {update?.checkedAt ? <p className="text-xs opacity-80">Checked {formatDate(update.checkedAt)}</p> : null}
      </div>
      <p className="mt-1 text-xs opacity-85">{detail}</p>
    </div>
  );
}

function ReleaseNotes({ update }: { update: UpdateStatus | null }) {
  return (
    <div className="border-y py-4 text-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium">{update?.releaseName ?? update?.message ?? "Release information is unavailable."}</p>
          {update?.publishedAt ? <p className="mt-1 text-xs text-muted-foreground">Published {formatDate(update.publishedAt)}</p> : null}
        </div>
        {update?.repository ? <span className="text-xs text-muted-foreground">{update.repository}</span> : null}
      </div>
      {update?.notes ? <p className="mt-3 whitespace-pre-wrap text-muted-foreground">{update.notes}</p> : null}
    </div>
  );
}

function ProfileSelector({ value, onChange }: { value: UpdateInstallProfile; onChange: (value: UpdateInstallProfile) => void }) {
  return (
    <div className="inline-flex rounded-md border bg-background p-1">
      <ProfileButton active={value === "docker"} onClick={() => onChange("docker")}>Docker Compose</ProfileButton>
      <ProfileButton active={value === "service"} onClick={() => onChange("service")}>Windows / NSSM</ProfileButton>
    </div>
  );
}

function ProfileButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return <Button type="button" variant={active ? "secondary" : "ghost"} size="sm" onClick={onClick} className="h-7">{children}</Button>;
}

function CommandBlock({ commands, copied, description, onCopy }: { commands: string[]; copied: boolean; description: string; onCopy: () => void }) {
  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="flex flex-col gap-3 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><Terminal className="mt-0.5 h-4 w-4 text-muted-foreground" /><p className="text-xs leading-5 text-muted-foreground">{description}</p></div>
        <Button type="button" variant="outline" size="sm" onClick={onCopy} disabled={commands.length === 0}>
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Clipboard className="mr-2 h-4 w-4" />}{copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-80 overflow-auto p-4 text-xs leading-6 text-foreground"><code>{commands.join("\n")}</code></pre>
    </div>
  );
}

function RepositoryHint() {
  return <div className="border-l-2 border-amber-500 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">Repository metadata is missing. Set `APP_UPDATE_REPO=owner/repository`, then restart the app.</div>;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Clipboard access is unavailable.");
  } finally {
    textarea.remove();
  }
}

function resolveProfileDescription(profile: UpdateInstallProfile) {
  return profile === "service"
    ? "For an existing Windows/NSSM install. The updater handles migrations, build, service restart, and logging."
    : "For Docker Compose installs. The web container applies schema bootstrap and manual migrations during startup.";
}

function UpdateMetric({ label, value }: { label: string; value: string }) {
  return <div className="border-b px-4 py-4 last:border-b-0 md:border-b-0"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-2 text-lg font-semibold">{value}</dd></div>;
}

function resolveUpdateStatusLabel(update: UpdateStatus | null, loading: boolean) {
  if (loading) return "Checking";
  if (!update) return "Unknown";
  if (update.status === "error") return "Check Failed";
  if (update.status === "unconfigured") return "Unconfigured";
  return update.updateAvailable ? "Update Available" : "Up To Date";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(date);
}
