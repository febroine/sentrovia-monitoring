ALTER TABLE "monitors"
  ADD COLUMN IF NOT EXISTS "expected_status_codes" varchar(500);

ALTER TABLE "settings"
  ALTER COLUMN "monitoring_timeout" SET DEFAULT 60000;

ALTER TABLE "monitors"
  ALTER COLUMN "timeout" SET DEFAULT 60000;
