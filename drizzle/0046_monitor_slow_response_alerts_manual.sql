ALTER TABLE "monitors"
  ADD COLUMN IF NOT EXISTS "slow_response_alerts_enabled" boolean DEFAULT true NOT NULL;

UPDATE "monitors"
SET "slow_response_alerts_enabled" = true
WHERE "slow_response_alerts_enabled" IS NULL;
