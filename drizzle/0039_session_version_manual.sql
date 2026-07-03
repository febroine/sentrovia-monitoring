ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "session_version" integer DEFAULT 1 NOT NULL;
