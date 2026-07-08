ALTER TABLE "monitors"
  ADD COLUMN IF NOT EXISTS "notification_language" varchar(8) DEFAULT 'default' NOT NULL;

UPDATE "monitors"
SET "notification_language" = 'default'
WHERE "notification_language" IS NULL
   OR "notification_language" NOT IN ('default', 'en', 'tr');
