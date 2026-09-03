import type { MonitorSummary } from "@/lib/monitors/types";

export function MonitorStats({ summary }: { summary: MonitorSummary }) {
  const { total, active, paused, online, offline, pending } = summary;

  const items = [
    { label: "Total monitors", value: String(total), sub: `${active} active / ${paused} paused`, tone: "" },
    { label: "Online", value: String(online), sub: "Responding normally", tone: "text-emerald-600 dark:text-emerald-400" },
    { label: "Offline", value: String(offline), sub: "Require attention", tone: "text-destructive" },
    { label: "Paused", value: String(paused), sub: pending > 0 ? `${pending} awaiting first check` : "Excluded from checks", tone: "text-amber-600 dark:text-amber-400" },
  ];

  return (
    <dl className="grid border-y md:grid-cols-2 xl:grid-cols-4 xl:divide-x">
      {items.map((item) => (
        <div key={item.label} className="border-b px-4 py-4 last:border-b-0 md:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0">
          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd className={`mt-2 text-2xl font-semibold tracking-tight ${item.tone}`}>{item.value}</dd>
          <p className="mt-1 text-xs text-muted-foreground">{item.sub}</p>
        </div>
      ))}
    </dl>
  );
}
