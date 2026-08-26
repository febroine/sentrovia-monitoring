ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "monitoring_slow_response_threshold_ms" integer,
  ADD COLUMN IF NOT EXISTS "slow_response_email_subject_template" text,
  ADD COLUMN IF NOT EXISTS "slow_response_email_body_template" text,
  ADD COLUMN IF NOT EXISTS "slow_response_telegram_template" text;

ALTER TABLE "monitors"
  ADD COLUMN IF NOT EXISTS "slow_response_email_subject" text,
  ADD COLUMN IF NOT EXISTS "slow_response_email_body" text,
  ADD COLUMN IF NOT EXISTS "slow_response_telegram_template" text;
