ALTER TABLE "users" DROP COLUMN IF EXISTS "timezone";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "locale";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "bio";
--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN IF EXISTS "require_mfa";
--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN IF EXISTS "session_timeout_minutes";
--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN IF EXISTS "ip_allowlist";
