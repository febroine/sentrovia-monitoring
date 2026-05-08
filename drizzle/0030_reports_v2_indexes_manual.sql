ALTER TABLE "report_schedules"
ADD COLUMN IF NOT EXISTS "attach_pdf" boolean DEFAULT true NOT NULL;

ALTER TABLE "report_schedules"
ADD COLUMN IF NOT EXISTS "email_subject_template" text;

ALTER TABLE "report_schedules"
ADD COLUMN IF NOT EXISTS "email_intro_template" text;

CREATE INDEX IF NOT EXISTS "monitors_user_active_next_check_idx"
ON "monitors" ("user_id", "is_active", "next_check_at");

CREATE INDEX IF NOT EXISTS "monitors_user_status_idx"
ON "monitors" ("user_id", "status");

CREATE INDEX IF NOT EXISTS "monitor_checks_user_monitor_created_idx"
ON "monitor_checks" ("user_id", "monitor_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "monitor_events_user_type_created_idx"
ON "monitor_events" ("user_id", "event_type", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "monitor_events_monitor_type_created_idx"
ON "monitor_events" ("monitor_id", "event_type", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "delivery_events_user_status_retry_idx"
ON "delivery_events" ("user_id", "channel", "status", "next_retry_at");

CREATE INDEX IF NOT EXISTS "report_schedules_due_idx"
ON "report_schedules" ("is_active", "next_run_at");

CREATE INDEX IF NOT EXISTS "report_schedules_user_created_idx"
ON "report_schedules" ("user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "monitor_incidents_user_status_started_idx"
ON "monitor_incidents" ("user_id", "status", "started_at" DESC);

CREATE INDEX IF NOT EXISTS "worker_cycle_metrics_created_idx"
ON "worker_cycle_metrics" ("created_at" DESC);
