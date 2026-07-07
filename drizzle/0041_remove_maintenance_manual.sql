DROP TABLE IF EXISTS "maintenance_windows";

ALTER TABLE "user_settings"
DROP COLUMN IF EXISTS "monitoring_maintenance_window";
