DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'smtp_sender'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'smtp_from_email'
  ) THEN
    ALTER TABLE user_settings RENAME COLUMN smtp_sender TO smtp_from_email;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "smtp_username" varchar(255);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "smtp_password_encrypted" text;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "smtp_default_to_email" varchar(255);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "smtp_secure" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "smtp_require_tls" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "smtp_insecure_skip_verify" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "next_check_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "last_success_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "last_failure_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "ssl_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "last_error_message" text;
--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "consecutive_failures" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "latency_ms" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitor_events" (
  "id" text PRIMARY KEY NOT NULL,
  "monitor_id" text NOT NULL REFERENCES "monitors"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "event_type" varchar(32) NOT NULL,
  "status" varchar(16),
  "status_code" integer,
  "latency_ms" integer,
  "message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_state" (
  "id" text PRIMARY KEY NOT NULL,
  "desired_state" varchar(16) DEFAULT 'stopped' NOT NULL,
  "running" boolean DEFAULT false NOT NULL,
  "checked_count" integer DEFAULT 0 NOT NULL,
  "last_cycle_at" timestamp with time zone,
  "heartbeat_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "stopped_at" timestamp with time zone,
  "pid" integer,
  "status_message" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
