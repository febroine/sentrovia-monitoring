import { afterEach, describe, expect, it, vi } from "vitest";
import {
  notifyMonitorHistoryReset,
  subscribeToMonitorHistoryReset,
} from "@/lib/client/monitor-history-events";

describe("monitor history reset events", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("notifies listeners and persists a cross-tab invalidation marker", () => {
    const target = new EventTarget();
    const setItem = vi.fn();
    vi.stubGlobal("window", Object.assign(target, {
      localStorage: { setItem },
    }));
    const listener = vi.fn();
    const unsubscribe = subscribeToMonitorHistoryReset(listener);

    notifyMonitorHistoryReset(["monitor-1", "monitor-1", "monitor-2"]);

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      monitorIds: ["monitor-1", "monitor-2"],
    }));
    expect(setItem).toHaveBeenCalledWith(
      "sentrovia:monitor-history-reset",
      expect.any(String)
    );

    unsubscribe();
    notifyMonitorHistoryReset(["monitor-3"]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
