CREATE TABLE IF NOT EXISTS "sentrovia_security_migrations" (
  "id" text PRIMARY KEY,
  "completed_at" timestamptz NOT NULL DEFAULT now()
);
