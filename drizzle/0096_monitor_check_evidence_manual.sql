CREATE TABLE IF NOT EXISTS "monitor_check_evidence" (
  "check_id" text PRIMARY KEY REFERENCES "monitor_checks"("id") ON DELETE CASCADE,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "monitor_id" text NOT NULL REFERENCES "monitors"("id") ON DELETE CASCADE,
  "evidence" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "monitor_check_evidence_monitor_created_idx"
  ON "monitor_check_evidence" ("monitor_id", "created_at");
