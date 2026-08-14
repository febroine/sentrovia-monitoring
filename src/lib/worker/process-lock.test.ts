import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  sql: {
    reserve: mocks.reserve,
  },
}));

import { acquireWorkerProcessLock } from "@/lib/worker/process-lock";

describe("worker process lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the reserved connection until the lock is released", async () => {
    const connection = createConnection();
    connection.query.mockResolvedValueOnce([{ acquired: true }]);
    mocks.reserve.mockResolvedValue(connection);

    const release = await acquireWorkerProcessLock();

    expect(release).toEqual(expect.any(Function));
    expect(connection.release).not.toHaveBeenCalled();

    await release?.();

    expect(connection.query).toHaveBeenCalledTimes(2);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it("returns no release function when another worker owns the lock", async () => {
    const connection = createConnection();
    connection.query.mockResolvedValueOnce([{ acquired: false }]);
    mocks.reserve.mockResolvedValue(connection);

    await expect(acquireWorkerProcessLock()).resolves.toBeNull();

    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  it("releases the connection when lock acquisition fails", async () => {
    const connection = createConnection();
    connection.query.mockRejectedValueOnce(new Error("database unavailable"));
    mocks.reserve.mockResolvedValue(connection);

    await expect(acquireWorkerProcessLock()).rejects.toThrow("database unavailable");

    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it("does not unlock or release the connection twice", async () => {
    const connection = createConnection();
    connection.query.mockResolvedValueOnce([{ acquired: true }]);
    mocks.reserve.mockResolvedValue(connection);

    const release = await acquireWorkerProcessLock();
    await release?.();
    await release?.();

    expect(connection.query).toHaveBeenCalledTimes(2);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});

function createConnection() {
  const query = vi.fn();
  return Object.assign(query, {
    release: vi.fn(),
    query,
  });
}
