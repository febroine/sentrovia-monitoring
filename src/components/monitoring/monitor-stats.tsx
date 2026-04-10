import { Activity, CheckCircle2, Globe, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { MonitorRecord } from "@/lib/monitors/types";

export function MonitorStats({ monitors }: { monitors: MonitorRecord[] }) {
  const total = monitors.length;
  const online = monitors.filter((monitor) => monitor.status === "up").length;
  const offline = monitors.filter((monitor) => monitor.status === "down").length;
  const pending = monitors.filter((monitor) => monitor.status === "pending").length;
  const coverage = total > 0 ? (online / total) * 100 : 0;

  const items = [
    { label: "Total monitors", value: String(total), sub: pending > 0 ? `${pending} awaiting first check` : "Inventory in scope", icon: Globe, tone: "text-slate-700 dark:text-slate-200", bar: "bg-slate-500" },
    { label: "Online", value: String(online), sub: "Responding normally", icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
    { label: "Offline", value: String(offline), sub: "Require attention", icon: XCircle, tone: "text-destructive", bar: "bg-destructive" },
    { label: "Coverage", value: `${coverage.toFixed(1)}%`, sub: "Healthy monitor ratio", icon: Activity, tone: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="overflow-hidden">
          <CardContent className="p-0">
            <div className="border-b bg-muted/20 px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                <div className="rounded-lg bg-background p-2 shadow-sm ring-1 ring-border">
                  <item.icon className={`h-4 w-4 ${item.tone}`} />
                </div>
              </div>
            </div>
            <div className="space-y-3 px-4 py-4">
              <div className="flex items-end justify-between gap-3">
                <p className={`text-3xl font-semibold tracking-tight ${item.tone}`}>{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.sub}</p>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${item.bar}`}
                  style={{ width: `${item.label === "Coverage" ? coverage : total > 0 ? (Number(item.value) / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
