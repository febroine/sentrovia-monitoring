ALTER TABLE "monitors"
  ADD COLUMN IF NOT EXISTS "heartbeat_token_hash" varchar(64);

DROP INDEX IF EXISTS "monitors_heartbeat_token_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "monitors_heartbeat_token_hash_unique"
  ON "monitors" ("heartbeat_token_hash")
  WHERE "heartbeat_token_hash" IS NOT NULL;
