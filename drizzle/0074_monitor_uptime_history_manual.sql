CREATE INDEX IF NOT EXISTS monitor_checks_user_monitor_created_at_idx
  ON monitor_checks (user_id, monitor_id, created_at);
