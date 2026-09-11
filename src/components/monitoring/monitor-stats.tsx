import type { MonitorSummary } from "@/lib/monitors/types";

export function MonitorStats({ summary }: { summary: MonitorSummary }) {
  const { total, active, paused, online, offline } = summary;

  const items = [
    { label: "Monitors", value: String(total), sub: `${active} active${paused > 0 ? ` / ${paused} paused` : ""}`, tone: "" },
    { label: "Online", value: String(online), sub: online > 0 ? "Responding normally" : "No monitors online", tone: online > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground" },
    { label: "Offline", value: String(offline), sub: offline > 0 ? "Require attention" : "No monitors require attention", tone: offline > 0 ? "text-destructive" : "text-muted-foreground" },
  ];

  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3 py-1">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-2">
          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd className={`text-base font-semibold tabular-nums ${item.tone}`}>{item.value}</dd>
          <dd className="sr-only">{item.sub}</dd>
        </div>
      ))}
    </dl>
  );
}
