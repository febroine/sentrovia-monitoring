ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "ssl_expiry_email_subject_template" text,
  ADD COLUMN IF NOT EXISTS "ssl_expiry_email_headline_template" text,
  ADD COLUMN IF NOT EXISTS "ssl_expiry_email_body_template" text,
  ADD COLUMN IF NOT EXISTS "ssl_expiry_telegram_template" text;
