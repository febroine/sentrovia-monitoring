// The worker marks its process so its database sessions get timeouts the web app does not need.
export const WORKER_PROCESS_ROLE = "worker";

// A worker query that waits on a lock or runs away would otherwise hold its connection, its monitor
// lease (renewed while the check runs) and a worker slot forever. Normal worker queries take
// milliseconds; the statement limit is generous so reports never hit it, and retention cleanup lifts
// it for its bulk deletes.
const WORKER_STATEMENT_TIMEOUT_MS = 300_000;
const WORKER_LOCK_TIMEOUT_MS = 60_000;

export function resolveDatabaseSessionSettings(processRole = process.env.SENTROVIA_PROCESS_ROLE) {
  return processRole === WORKER_PROCESS_ROLE
    ? { statement_timeout: WORKER_STATEMENT_TIMEOUT_MS, lock_timeout: WORKER_LOCK_TIMEOUT_MS }
    : undefined;
}
