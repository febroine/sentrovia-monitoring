CREATE TABLE "user_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"notify_on_down" boolean DEFAULT true NOT NULL,
	"notify_on_recovery" boolean DEFAULT true NOT NULL,
	"notify_on_latency" boolean DEFAULT true NOT NULL,
	"notify_on_ssl_expiry" boolean DEFAULT true NOT NULL,
	"notify_on_status_change" boolean DEFAULT false NOT NULL,
	"smtp_host" varchar(255),
	"smtp_port" integer DEFAULT 587 NOT NULL,
	"smtp_sender" varchar(255),
	"monitoring_interval" varchar(16) DEFAULT '1m' NOT NULL,
	"monitoring_timeout" integer DEFAULT 5000 NOT NULL,
	"monitoring_retries" integer DEFAULT 3 NOT NULL,
	"monitoring_method" varchar(10) DEFAULT 'GET' NOT NULL,
	"monitoring_region" varchar(64) DEFAULT 'eu-central' NOT NULL,
	"monitoring_maintenance_window" varchar(120),
	"require_mfa" boolean DEFAULT false NOT NULL,
	"session_timeout_minutes" integer DEFAULT 60 NOT NULL,
	"ip_allowlist" text,
	"reduce_motion" boolean DEFAULT false NOT NULL,
	"compact_density" boolean DEFAULT false NOT NULL,
	"dashboard_landing_page" varchar(32) DEFAULT 'dashboard' NOT NULL,
	"data_retention_days" integer DEFAULT 90 NOT NULL,
	"auto_backup_enabled" boolean DEFAULT true NOT NULL,
	"backup_window" varchar(32) DEFAULT '03:00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" varchar(80);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "organization" varchar(160);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "job_title" varchar(120);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" varchar(40);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" varchar(80);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" varchar(32);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_settings_user_id_unique" ON "user_settings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");