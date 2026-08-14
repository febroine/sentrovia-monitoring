import { sql } from "@/lib/db";

const WORKER_PROCESS_LOCK_KEY = 51_772_904;

export type WorkerProcessLockRelease = () => Promise<void>;

export async function acquireWorkerProcessLock(): Promise<WorkerProcessLockRelease | null> {
  const connection = await sql.reserve();

  try {
    const [result] = await connection`
      select pg_try_advisory_lock(${WORKER_PROCESS_LOCK_KEY}) as acquired
    `;

    if (!result?.acquired) {
      connection.release();
      return null;
    }

    let released = false;
    return async () => {
      if (released) {
        return;
      }

      released = true;
      try {
        await connection`
          select pg_advisory_unlock(${WORKER_PROCESS_LOCK_KEY})
        `;
      } finally {
        connection.release();
      }
    };
  } catch (error) {
    connection.release();
    throw error;
  }
}
