import { describe, expect, it, vi } from "vitest";
import { LatestRequestCommitter } from "@/lib/client/latest-request";

describe("latest request commit ownership", () => {
  it("does not commit an older response for the same resource key", async () => {
    const requests = new LatestRequestCommitter();
    const older = createPendingValue<string>();
    const newer = createPendingValue<string>();
    const commit = vi.fn();

    const olderRun = requests.run("monitor-1", () => older.promise, commit);
    const newerRun = requests.run("monitor-1", () => newer.promise, commit);
    newer.resolve("newer history");
    await expect(newerRun).resolves.toBe("newer history");
    older.resolve("older history");
    await expect(olderRun).resolves.toBeNull();

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("newer history");
  });

  it("allows independent resource keys to commit", async () => {
    const requests = new LatestRequestCommitter();
    const commit = vi.fn();

    await Promise.all([
      requests.run("monitor-1", async () => "first", commit),
      requests.run("monitor-2", async () => "second", commit),
    ]);

    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledWith("first");
    expect(commit).toHaveBeenCalledWith("second");
  });
});

function createPendingValue<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}
