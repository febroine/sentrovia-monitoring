ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "status_code_alert_codes" varchar(500);

CREATE TABLE IF NOT EXISTS "monitor_checks" (
  "id" text PRIMARY KEY,
  "monitor_id" text NOT NULL REFERENCES "monitors"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" varchar(16) NOT NULL,
  "status_code" integer,
  "latency_ms" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
