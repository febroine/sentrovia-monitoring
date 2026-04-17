ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "recovery_email_subject_template" text,
  ADD COLUMN IF NOT EXISTS "recovery_email_body_template" text,
  ADD COLUMN IF NOT EXISTS "recovery_telegram_template" text;
