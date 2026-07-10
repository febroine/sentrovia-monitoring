ALTER TABLE "delivery_events"
  ADD COLUMN IF NOT EXISTS "claim_token" text,
  ADD COLUMN IF NOT EXISTS "claim_expires_at" timestamp with time zone;

ALTER TABLE "report_schedules"
  ADD COLUMN IF NOT EXISTS "claim_token" text,
  ADD COLUMN IF NOT EXISTS "claim_expires_at" timestamp with time zone;

UPDATE "monitors"
SET "retries" = 2
WHERE "retries" < 2;

UPDATE "user_settings"
SET "monitoring_retries" = 2
WHERE "monitoring_retries" < 2;

CREATE INDEX IF NOT EXISTS "delivery_events_webhook_claim_due_idx"
  ON "delivery_events" ("channel", "status", "claim_expires_at", "next_retry_at", "created_at");

CREATE INDEX IF NOT EXISTS "report_schedules_claim_due_idx"
  ON "report_schedules" ("is_active", "next_run_at", "last_status", "claim_expires_at");
