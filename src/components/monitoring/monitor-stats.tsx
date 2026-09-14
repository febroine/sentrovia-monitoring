import type { MonitorSummary } from "@/lib/monitors/types";

type MonitorStatusFilter = "all" | "up" | "down";

export function MonitorStats({
  summary,
  activeFilter,
  onFilterChange,
}: {
  summary: MonitorSummary;
  activeFilter: MonitorStatusFilter;
  onFilterChange: (filter: MonitorStatusFilter) => void;
}) {
  const { total, active, paused, online, offline } = summary;

  const items = [
    { label: "Monitors", value: String(total), sub: `${active} active${paused > 0 ? ` / ${paused} paused` : ""}`, tone: "", filter: "all" as const },
    { label: "Online", value: String(online), sub: online > 0 ? "Responding normally" : "No monitors online", tone: online > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground", filter: "up" as const },
    { label: "Offline", value: String(offline), sub: offline > 0 ? "Require attention" : "No monitors require attention", tone: offline > 0 ? "text-destructive" : "text-muted-foreground", filter: "down" as const },
  ];

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3 py-1" aria-label="Monitor status filters">
      {items.map((item) => (
        <div key={item.label}>
          <button
            type="button"
            aria-pressed={activeFilter === item.filter}
            aria-label={`Show ${item.label.toLowerCase()}`}
            onClick={() => onFilterChange(item.filter)}
            className={`flex items-baseline gap-2 rounded-sm px-1 py-0.5 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 ${activeFilter === item.filter ? "bg-muted/40" : ""}`}
          >
            <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
            <span className={`text-base font-semibold tabular-nums ${item.tone}`}>{item.value}</span>
          </button>
          <span className="sr-only">{item.sub}</span>
        </div>
      ))}
    </div>
  );
}
