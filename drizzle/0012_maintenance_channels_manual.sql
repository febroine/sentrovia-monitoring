ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "slack_webhook_url" varchar(500);

ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "slack_enabled" boolean NOT NULL DEFAULT false;

ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "discord_webhook_url" varchar(500);

ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "discord_enabled" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "maintenance_windows" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(160) NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "timezone" varchar(64) NOT NULL DEFAULT 'Europe/Istanbul',
  "is_active" boolean NOT NULL DEFAULT true,
  "suppress_notifications" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
