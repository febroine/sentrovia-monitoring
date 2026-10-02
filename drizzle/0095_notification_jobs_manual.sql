CREATE TABLE IF NOT EXISTS "notification_jobs" (
  "id" text PRIMARY KEY,
  "seq" bigserial NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "monitor_id" text NOT NULL REFERENCES "monitors"("id") ON DELETE CASCADE,
  "kind" varchar(24) NOT NULL,
  "dedupe_key" varchar(32),
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "payload" text NOT NULL,
  "checked_at" timestamptz NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
  "claim_token" text,
  "claim_expires_at" timestamptz,
  "delivery_started_at" timestamptz,
  "outcome" varchar(16),
  "last_error" text,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "notification_jobs_status_check" CHECK ("status" IN ('pending', 'processing', 'done', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_jobs_pending_dedupe_idx"
  ON "notification_jobs" ("monitor_id", "dedupe_key")
  WHERE "status" IN ('pending', 'processing') AND "dedupe_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "notification_jobs_claim_idx"
  ON "notification_jobs" ("status", "next_attempt_at", "seq");

CREATE INDEX IF NOT EXISTS "notification_jobs_monitor_seq_idx"
  ON "notification_jobs" ("monitor_id", "seq");

CREATE INDEX IF NOT EXISTS "notification_jobs_completed_idx"
  ON "notification_jobs" ("completed_at");
