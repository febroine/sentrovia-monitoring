ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "default_email_headline_template" text,
  ADD COLUMN IF NOT EXISTS "recovery_email_headline_template" text,
  ADD COLUMN IF NOT EXISTS "slow_response_email_headline_template" text,
  ADD COLUMN IF NOT EXISTS "prolonged_downtime_email_headline_template" text;
