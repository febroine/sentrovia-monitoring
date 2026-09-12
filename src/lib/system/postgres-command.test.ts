import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));

import { runPostgresCommand } from "@/lib/system/postgres-command";

describe("PostgreSQL child command lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after a successful command closes", async () => {
    const child = createChildProcess();
    mocks.spawn.mockReturnValue(child);

    const command = runPostgresCommand("pg_dump", ["--file", "backup.dump"], process.env, "pg_dump", { timeoutMs: 100 });
    child.emit("close", 0);

    await expect(command).resolves.toBeUndefined();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("waits for child close after requesting timeout termination", async () => {
    vi.useFakeTimers();
    const child = createChildProcess();
    mocks.spawn.mockReturnValue(child);

    const command = runPostgresCommand("pg_restore", [], process.env, "pg_restore", {
      timeoutMs: 25,
      terminationGraceMs: 10,
      forcedTerminationWaitMs: 10,
    });
    const settled = vi.fn();
    void command.then(settled, settled);
    const rejection = expect(command).rejects.toThrow("pg_restore timed out after 25ms.");
    await vi.advanceTimersByTimeAsync(25);

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(settled).not.toHaveBeenCalled();
    child.stderr.emit("data", Buffer.from("cancelled by timeout"));
    child.emit("close", null);
    await rejection;
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("forces termination and reports a non-closing child without hanging", async () => {
    vi.useFakeTimers();
    const child = createChildProcess();
    mocks.spawn.mockReturnValue(child);

    const command = runPostgresCommand("pg_dump", [], process.env, "pg_dump", {
      timeoutMs: 20,
      terminationGraceMs: 5,
      forcedTerminationWaitMs: 7,
    });
    const rejection = expect(command).rejects.toThrow(/Termination could not be confirmed/);
    await vi.advanceTimersByTimeAsync(20);
    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    await vi.advanceTimersByTimeAsync(5);
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
    await vi.advanceTimersByTimeAsync(7);

    await rejection;
  });

  it("falls back to forced termination when the graceful kill is rejected", async () => {
    vi.useFakeTimers();
    const child = createChildProcess();
    child.kill.mockReturnValueOnce(false).mockReturnValueOnce(false);
    mocks.spawn.mockReturnValue(child);

    const command = runPostgresCommand("pg_restore", [], process.env, "pg_restore", {
      timeoutMs: 20,
      terminationGraceMs: 5,
      forcedTerminationWaitMs: 7,
    });
    const rejection = expect(command).rejects.toThrow(/SIGKILL was not accepted/);
    await vi.advanceTimersByTimeAsync(20);

    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
    await vi.advanceTimersByTimeAsync(7);
    await rejection;
  });

  it("keeps bounded stderr context for non-zero exits", async () => {
    const child = createChildProcess();
    mocks.spawn.mockReturnValue(child);

    const command = runPostgresCommand("pg_dump", [], process.env, "pg_dump", { timeoutMs: 100 });
    child.stderr.emit("data", Buffer.from("database connection failed"));
    child.emit("close", 2);

    await expect(command).rejects.toThrow("pg_dump failed with exit code 2: database connection failed");
    expect(child.kill).not.toHaveBeenCalled();
  });
});

function createChildProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stderr = new EventEmitter();
  child.kill = vi.fn(() => true);
  return child;
}
