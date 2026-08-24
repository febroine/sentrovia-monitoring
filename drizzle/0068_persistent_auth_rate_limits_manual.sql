CREATE TABLE IF NOT EXISTS "auth_rate_limits" (
  "rate_key" varchar(64) PRIMARY KEY,
  "action" varchar(32) NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "window_started_at" timestamptz NOT NULL,
  "blocked_until" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "auth_rate_limits_updated_idx"
  ON "auth_rate_limits" ("updated_at");
