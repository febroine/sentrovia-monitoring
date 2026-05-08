ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "public_status_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "public_status_slug" varchar(120),
  ADD COLUMN IF NOT EXISTS "public_status_title" varchar(160),
  ADD COLUMN IF NOT EXISTS "public_status_summary" text;

CREATE UNIQUE INDEX IF NOT EXISTS "user_settings_public_status_slug_unique"
  ON "user_settings" ("public_status_slug");

ALTER TABLE "report_schedules"
  ADD COLUMN IF NOT EXISTS "delivery_detail_level" varchar(16) DEFAULT 'standard' NOT NULL,
  ADD COLUMN IF NOT EXISTS "attach_csv" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "attach_html" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "include_incident_summary" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "include_monitor_breakdown" boolean DEFAULT true NOT NULL;
