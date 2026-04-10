ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "saved_email_recipients" text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "monitoring_ignore_ssl_errors" boolean NOT NULL DEFAULT true;

ALTER TABLE "user_settings"
  ALTER COLUMN "monitoring_interval" SET DEFAULT '5m';

UPDATE "user_settings"
SET "monitoring_interval" = '5m'
WHERE "monitoring_interval" = '1m';
