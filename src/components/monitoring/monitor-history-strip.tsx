import type { MonitorHistoryPoint } from "@/lib/monitors/types";
import { cn } from "@/lib/utils";

export function MonitorHistoryStrip({
  points,
  onSelect,
}: {
  points: MonitorHistoryPoint[];
  onSelect?: (point: MonitorHistoryPoint) => void;
}) {
  if (points.length === 0) {
    return <p className="text-xs text-muted-foreground">No recent checks yet.</p>;
  }

  return (
    <div className="flex items-center gap-1">
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
            "h-2.5 w-5 rounded-full transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
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
  return `${point.status.toUpperCase()} · ${timestamp}${code}${latency}`;
}
