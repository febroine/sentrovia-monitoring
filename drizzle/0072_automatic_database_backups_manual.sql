ALTER TABLE "user_settings"
  ALTER COLUMN "auto_backup_enabled" SET DEFAULT false;

ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "backup_retention_count" integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS "last_backup_status" varchar(16),
  ADD COLUMN IF NOT EXISTS "last_backup_error" text,
  ADD COLUMN IF NOT EXISTS "last_automatic_backup_at" timestamptz;

UPDATE "user_settings"
SET "auto_backup_enabled" = false
WHERE "last_backup_at" IS NULL;

CREATE TABLE IF NOT EXISTS "automatic_backup_runs" (
  "id" text PRIMARY KEY,
  "owner_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "scheduled_date" varchar(10) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'running',
  "attempts" integer NOT NULL DEFAULT 1,
  "file_name" varchar(255),
  "size_bytes" bigint,
  "checksum_sha256" varchar(64),
  "error_message" text,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "automatic_backup_runs_scheduled_date_unique"
  ON "automatic_backup_runs" ("scheduled_date");

CREATE INDEX IF NOT EXISTS "automatic_backup_runs_status_updated_idx"
  ON "automatic_backup_runs" ("status", "updated_at");
