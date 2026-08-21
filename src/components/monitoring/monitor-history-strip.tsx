import type { MonitorHistoryPoint } from "@/lib/monitors/types";
import { toEnglishUppercase } from "@/lib/text/casing";
import { cn } from "@/lib/utils";

export function MonitorHistoryStrip({
  points,
  onSelect,
  compact = false,
}: {
  points: MonitorHistoryPoint[];
  onSelect?: (point: MonitorHistoryPoint) => void;
  compact?: boolean;
}) {
  if (points.length === 0) {
    return compact
      ? <p className="text-[10px] text-muted-foreground" title="No recent checks yet">--</p>
      : <p className="text-xs text-muted-foreground">No recent checks yet.</p>;
  }

  return (
    <div className={cn("flex items-center", compact ? "gap-0.5" : "gap-1")}>
      {points.map((point) => (
        <button
          type="button"
          key={point.id}
          title={buildTitle(point)}
          onClick={(event) => {
            event.stopPropagation();
            onSelect?.(point);
          }}
          className={cn(
            "transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            compact ? "h-2.5 min-w-0 flex-1 rounded-[2px]" : "h-2.5 w-5 rounded-full",
            point.status === "up"
              ? "bg-emerald-500/85"
              : point.status === "pending"
                ? "bg-amber-500/85"
                : "bg-destructive/85"
          )}
        />
      ))}
    </div>
  );
}

function buildTitle(point: MonitorHistoryPoint) {
  const timestamp = new Date(point.createdAt).toLocaleString();
  const code = point.statusCode ? ` · HTTP ${point.statusCode}` : "";
  const latency = point.latencyMs ? ` · ${point.latencyMs}ms` : "";
  return `${toEnglishUppercase(point.status)} · ${timestamp}${code}${latency}`;
}
