ALTER TABLE "user_settings"
  ALTER COLUMN "discord_webhook_url" TYPE text;

ALTER TABLE "webhook_endpoints"
  ALTER COLUMN "url" TYPE text;
