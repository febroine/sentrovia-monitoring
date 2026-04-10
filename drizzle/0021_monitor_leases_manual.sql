ALTER TABLE "monitors"
ADD COLUMN IF NOT EXISTS "lease_token" text;

ALTER TABLE "monitors"
ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp with time zone;
