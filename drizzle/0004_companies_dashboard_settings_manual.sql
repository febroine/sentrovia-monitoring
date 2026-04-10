ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "monitoring_response_max_length" integer DEFAULT 1024 NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "monitoring_max_redirects" integer DEFAULT 5 NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "show_incident_banner" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "show_charts_section" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "event_retention_days" integer DEFAULT 30 NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companies" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" varchar(160) NOT NULL,
  "website" varchar(255),
  "email" varchar(255),
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "company_id" text REFERENCES "companies"("id") ON DELETE set null;
