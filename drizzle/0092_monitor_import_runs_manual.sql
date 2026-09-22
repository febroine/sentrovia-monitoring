CREATE TABLE IF NOT EXISTS "monitor_import_runs" (
  "id" text PRIMARY KEY,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "file_name" varchar(255) NOT NULL,
  "source" varchar(16) NOT NULL DEFAULT 'csv',
  "added_count" integer NOT NULL DEFAULT 0,
  "skipped_count" integer NOT NULL DEFAULT 0,
  "invalid_count" integer NOT NULL DEFAULT 0,
  "created_monitor_ids" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "status" varchar(16) NOT NULL DEFAULT 'completed',
  "undone_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "monitor_import_runs_status_check" CHECK ("status" IN ('completed', 'undone'))
);

CREATE INDEX IF NOT EXISTS "monitor_import_runs_workspace_created_idx"
  ON "monitor_import_runs" ("workspace_id", "created_at");

CREATE INDEX IF NOT EXISTS "monitor_import_runs_workspace_status_created_idx"
  ON "monitor_import_runs" ("workspace_id", "status", "created_at");
