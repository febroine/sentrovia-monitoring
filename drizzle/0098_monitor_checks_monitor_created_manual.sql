CREATE INDEX IF NOT EXISTS "monitor_checks_monitor_created_idx"
  ON "monitor_checks" ("monitor_id", "created_at");
