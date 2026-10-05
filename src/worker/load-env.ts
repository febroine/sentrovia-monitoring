import { loadEnvConfig } from "@next/env";
import { WORKER_PROCESS_ROLE } from "@/lib/db/session-settings";

loadEnvConfig(process.cwd());
// Read when the database connections are created, so it must be set before anything imports them.
process.env.SENTROVIA_PROCESS_ROLE = WORKER_PROCESS_ROLE;
