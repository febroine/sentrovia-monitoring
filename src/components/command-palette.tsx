"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BellRing,
  Building2,
  CircleHelp,
  FilePlus2,
  Info,
  LayoutDashboard,
  Radar,
  ScrollText,
  Settings,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type CommandItem = {
  id: string;
  title: string;
  hint: string;
  href: string;
  icon: LucideIcon;
  keywords: string[];
};

const COMMAND_ITEMS: CommandItem[] = [
  { id: "dashboard", title: "Go to Dashboard", hint: "Global runtime overview", href: "/dashboard", icon: LayoutDashboard, keywords: ["dashboard", "home", "overview"] },
  { id: "monitoring", title: "Open Monitoring", hint: "Monitor inventory and builder", href: "/monitoring", icon: Activity, keywords: ["monitoring", "monitors", "checks"] },
  { id: "monitor-create", title: "Add Monitor", hint: "Jump to the monitor builder", href: "/monitoring?create=1", icon: FilePlus2, keywords: ["monitor", "create", "new", "add"] },
  { id: "companies", title: "Open Companies", hint: "Customer and monitor grouping", href: "/companies", icon: Building2, keywords: ["companies", "customers", "clients"] },
  { id: "logs", title: "Open Event Logs", hint: "Search worker and monitor events", href: "/logs", icon: ScrollText, keywords: ["logs", "events", "history"] },
  { id: "delivery", title: "Open Delivery", hint: "Channels, tests, and delivery history", href: "/delivery", icon: BellRing, keywords: ["delivery", "email", "telegram", "webhook"] },
  { id: "reports", title: "Open Reports", hint: "Preview and schedule report delivery", href: "/reports?mode=preview", icon: BarChart3, keywords: ["reports", "preview", "send"] },
  { id: "reports-schedule", title: "New Report Schedule", hint: "Jump directly to schedule manager", href: "/reports?mode=schedules", icon: FilePlus2, keywords: ["report", "schedule", "automation"] },
  { id: "observability", title: "Open Observability", hint: "Worker insight dashboard", href: "/observability", icon: Radar, keywords: ["observability", "worker", "insights"] },
  { id: "members", title: "Open Members", hint: "Registered workspace users", href: "/members", icon: UsersRound, keywords: ["members", "users", "accounts"] },
  { id: "settings", title: "Open Settings", hint: "Workspace preferences and delivery config", href: "/settings", icon: Settings, keywords: ["settings", "preferences", "config"] },
  { id: "help", title: "Open Help", hint: "In-product usage guidance", href: "/help", icon: CircleHelp, keywords: ["help", "docs", "guide"] },
  { id: "about", title: "Open About", hint: "Architecture and runtime model", href: "/about", icon: Info, keywords: ["about", "architecture", "runtime"] },
];

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return COMMAND_ITEMS;
    }

    return COMMAND_ITEMS.filter((item) =>
      [item.title, item.hint, ...item.keywords].join(" ").toLowerCase().includes(normalizedQuery)
    );
  }, [query]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setOpen(false);
      setQuery("");
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [pathname]);

  function runCommand(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-5 top-4 z-40 hidden items-center gap-2 rounded-2xl border border-border/70 bg-card/90 px-3 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur md:flex"
      >
        <span>Quick Jump</span>
        <Badge variant="outline" className="border-border/70 bg-background/70 text-[11px] text-muted-foreground">
          Ctrl K
        </Badge>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl overflow-hidden border-border/70 p-0" showCloseButton={false}>
          <DialogHeader className="border-b border-border/60 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <DialogTitle>Command Palette</DialogTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Jump across pages and operator tasks without hunting through the sidebar.
                </p>
              </div>
              <Badge variant="outline" className="border-border/70 text-muted-foreground">
                Ctrl K
              </Badge>
            </div>
          </DialogHeader>

          <div className="space-y-4 px-5 py-4">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search pages, actions, and operator shortcuts"
              autoFocus
            />

            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {filteredItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
                  No commands match this search yet.
                </div>
              ) : (
                filteredItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => runCommand(item.href)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-2xl border border-border/70 bg-background px-4 py-4 text-left transition-colors hover:border-border hover:bg-muted/10"
                      )}
                    >
                      <div className="rounded-xl border border-border/70 bg-muted/10 p-2.5">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs leading-5 text-muted-foreground">{item.hint}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
