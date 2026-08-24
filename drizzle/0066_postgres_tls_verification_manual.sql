ALTER TABLE "monitors"
  ADD COLUMN IF NOT EXISTS "database_tls_verify" boolean;

UPDATE "monitors"
SET "database_tls_verify" = false
WHERE "database_tls_verify" IS NULL;

ALTER TABLE "monitors"
  ALTER COLUMN "database_tls_verify" SET DEFAULT true,
  ALTER COLUMN "database_tls_verify" SET NOT NULL;
