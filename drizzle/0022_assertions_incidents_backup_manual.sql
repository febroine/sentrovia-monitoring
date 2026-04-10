ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "alert_dedup_minutes" integer DEFAULT 15 NOT NULL,
  ADD COLUMN IF NOT EXISTS "last_backup_at" timestamp with time zone;

ALTER TABLE "monitors"
  ADD COLUMN IF NOT EXISTS "keyword_query" text,
  ADD COLUMN IF NOT EXISTS "keyword_invert" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "json_path" varchar(255),
  ADD COLUMN IF NOT EXISTS "json_expected_value" text,
  ADD COLUMN IF NOT EXISTS "json_match_mode" varchar(16) DEFAULT 'equals' NOT NULL;

CREATE TABLE IF NOT EXISTS "monitor_incidents" (
  "id" text PRIMARY KEY NOT NULL,
  "monitor_id" text NOT NULL REFERENCES "monitors"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "status" varchar(16) DEFAULT 'open' NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "last_checked_at" timestamp with time zone,
  "status_code" integer,
  "error_message" text,
  "notes" text DEFAULT '' NOT NULL,
  "postmortem" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
