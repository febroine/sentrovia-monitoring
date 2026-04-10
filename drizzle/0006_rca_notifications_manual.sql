ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "default_email_subject_template" text,
  ADD COLUMN IF NOT EXISTS "default_email_body_template" text,
  ADD COLUMN IF NOT EXISTS "default_telegram_template" text;

ALTER TABLE "monitor_events"
  ADD COLUMN IF NOT EXISTS "rca_type" varchar(32),
  ADD COLUMN IF NOT EXISTS "rca_title" varchar(160),
  ADD COLUMN IF NOT EXISTS "rca_summary" text;
