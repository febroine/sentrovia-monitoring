ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "notification_email_scopes" jsonb NOT NULL DEFAULT '{}'::jsonb;
