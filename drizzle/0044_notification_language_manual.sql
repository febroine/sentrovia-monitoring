ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "notification_language" varchar(8) DEFAULT 'en' NOT NULL;
