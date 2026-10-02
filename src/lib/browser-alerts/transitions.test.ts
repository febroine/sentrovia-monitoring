import { describe, expect, it } from "vitest";
import { describeAlertTransition, detectAlertTransitions, type MonitorAlertSnapshot, type MonitorAlertState } from "@/lib/browser-alerts/transitions";

function snapshot(states: Record<string, MonitorAlertState>): MonitorAlertSnapshot[] {
  return Object.entries(states).map(([id, state]) => ({ id, name: `Monitor ${id}`, url: `https://${id}.example.com`, state }));
}

function run(...snapshots: Array<Record<string, MonitorAlertState>>) {
  let confirmed = null;
  const results = [];
  for (const states of snapshots) {
    const result = detectAlertTransitions(confirmed, snapshot(states));
    confirmed = result.next;
    results.push({ down: result.wentDown.map((item) => item.id), recovered: result.recovered.map((item) => item.id) });
  }
  return results;
}

describe("detectAlertTransitions", () => {
  it("only sets the baseline on the first snapshot", () => {
    expect(run({ a: "down", b: "up" })).toEqual([{ down: [], recovered: [] }]);
  });

  it("reports a confirmed outage and its recovery once", () => {
    expect(run({ a: "up" }, { a: "down" }, { a: "down" }, { a: "up" }, { a: "up" })).toEqual([
      { down: [], recovered: [] },
      { down: ["a"], recovered: [] },
      { down: [], recovered: [] },
      { down: [], recovered: ["a"] },
      { down: [], recovered: [] },
    ]);
  });

  it("keeps the confirmed state while a monitor is verifying, pending or paused", () => {
    expect(run({ a: "up" }, { a: "idle" }, { a: "down" }, { a: "idle" }, { a: "up" })).toEqual([
      { down: [], recovered: [] },
      { down: [], recovered: [] },
      { down: ["a"], recovered: [] },
      { down: [], recovered: [] },
      { down: [], recovered: ["a"] },
    ]);
  });

  it("does not report a failure that was never confirmed", () => {
    expect(run({ a: "up" }, { a: "idle" }, { a: "up" })).toEqual([
      { down: [], recovered: [] },
      { down: [], recovered: [] },
      { down: [], recovered: [] },
    ]);
  });

  it("reports a new monitor's first outage once it has been seen", () => {
    expect(run({ a: "up" }, { a: "up", b: "idle" }, { a: "up", b: "down" })).toEqual([
      { down: [], recovered: [] },
      { down: [], recovered: [] },
      { down: ["b"], recovered: [] },
    ]);
  });

  it("does not report a monitor that appears already down", () => {
    expect(run({ a: "up" }, { a: "up", b: "down" })[1]).toEqual({ down: [], recovered: [] });
  });
});

describe("describeAlertTransition", () => {
  it("names a single monitor", () => {
    expect(describeAlertTransition("down", snapshot({ a: "down" }))).toEqual({ title: "Monitor a is down", body: "https://a.example.com" });
    expect(describeAlertTransition("recovered", snapshot({ a: "up" })).title).toBe("Monitor a is back up");
  });

  it("lists several monitors in one notification", () => {
    const monitors = snapshot({ a: "down", b: "down", c: "down", d: "down", e: "down", f: "down", g: "down" });
    expect(describeAlertTransition("down", monitors)).toEqual({
      title: "7 monitors are down",
      body: "Monitor a, Monitor b, Monitor c, Monitor d, Monitor e and 2 more",
    });
  });
});
