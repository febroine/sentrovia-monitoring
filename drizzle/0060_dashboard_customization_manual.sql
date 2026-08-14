ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "dashboard_widgets" text,
  ADD COLUMN IF NOT EXISTS "dashboard_company_id" text,
  ADD COLUMN IF NOT EXISTS "dashboard_focus" varchar(16) NOT NULL DEFAULT 'all';

ALTER TABLE "monitors"
  ADD COLUMN IF NOT EXISTS "is_favorite" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_critical" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "monitors_user_favorite_critical_idx"
  ON "monitors" ("user_id", "is_favorite", "is_critical", "status");
