CREATE INDEX IF NOT EXISTS delivery_events_monitor_created_idx
  ON delivery_events (monitor_id, created_at, id);
