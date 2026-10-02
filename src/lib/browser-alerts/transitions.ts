// What the console tells the browser about each monitor: confirmed down, up, or neither (pending,
// still verifying a failure, paused or inactive).
export type MonitorAlertState = "down" | "up" | "idle";

export type MonitorAlertSnapshot = {
  id: string;
  name: string;
  url: string;
  state: MonitorAlertState;
};

// The last confirmed state of each monitor seen so far; "idle" until one was confirmed.
export type ConfirmedStates = Map<string, MonitorAlertState>;

// Compares a new snapshot with the last confirmed state of each monitor. A monitor passing through
// "idle" keeps its last confirmed state, so a recovery verified in between is still reported. The
// first snapshot, and monitors seen for the first time, only set the baseline.
export function detectAlertTransitions(previous: ConfirmedStates | null, snapshot: MonitorAlertSnapshot[]) {
  const next: ConfirmedStates = new Map();
  const wentDown: MonitorAlertSnapshot[] = [];
  const recovered: MonitorAlertSnapshot[] = [];

  for (const monitor of snapshot) {
    const before = previous?.get(monitor.id);
    if (monitor.state === "idle") {
      next.set(monitor.id, before ?? "idle");
      continue;
    }
    next.set(monitor.id, monitor.state);
    if (before === undefined) continue;
    if (monitor.state === "down" && before !== "down") wentDown.push(monitor);
    if (monitor.state === "up" && before === "down") recovered.push(monitor);
  }

  return { next, wentDown, recovered };
}

// One notification per kind of change; several monitors are listed in one.
export function describeAlertTransition(kind: "down" | "recovered", monitors: MonitorAlertSnapshot[]) {
  const [first] = monitors;
  if (monitors.length === 1) {
    return {
      title: kind === "down" ? `${first.name} is down` : `${first.name} is back up`,
      body: first.url,
    };
  }
  const names = monitors.slice(0, 5).map((monitor) => monitor.name).join(", ");
  const more = monitors.length > 5 ? ` and ${monitors.length - 5} more` : "";
  return {
    title: kind === "down" ? `${monitors.length} monitors are down` : `${monitors.length} monitors are back up`,
    body: `${names}${more}`,
  };
}
