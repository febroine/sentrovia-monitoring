ALTER TABLE "maintenance_windows"
ADD COLUMN IF NOT EXISTS "recurrence" varchar(16) DEFAULT 'none' NOT NULL;

ALTER TABLE "maintenance_windows"
ADD COLUMN IF NOT EXISTS "scope" varchar(16) DEFAULT 'all' NOT NULL;

ALTER TABLE "maintenance_windows"
ADD COLUMN IF NOT EXISTS "monitor_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL;

ALTER TABLE "maintenance_windows"
ADD COLUMN IF NOT EXISTS "company_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL;

ALTER TABLE "maintenance_windows"
ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT ARRAY[]::text[] NOT NULL;

ALTER TABLE "maintenance_windows"
ADD COLUMN IF NOT EXISTS "suppress_checks" boolean DEFAULT false NOT NULL;

ALTER TABLE "maintenance_windows"
ADD COLUMN IF NOT EXISTS "reason" text DEFAULT '' NOT NULL;

ALTER TABLE "monitor_incidents"
ADD COLUMN IF NOT EXISTS "acknowledged_at" timestamp with time zone;

ALTER TABLE "monitor_incidents"
ADD COLUMN IF NOT EXISTS "acknowledged_by" text REFERENCES "users"("id") ON DELETE set null;

ALTER TABLE "monitor_incidents"
ADD COLUMN IF NOT EXISTS "acknowledgement_note" text DEFAULT '' NOT NULL;

CREATE INDEX IF NOT EXISTS "maintenance_windows_user_active_idx"
ON "maintenance_windows" ("user_id", "is_active", "starts_at", "ends_at");

CREATE INDEX IF NOT EXISTS "monitor_incidents_user_status_ack_idx"
ON "monitor_incidents" ("user_id", "status", "acknowledged_at");
