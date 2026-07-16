create index if not exists delivery_events_user_created_at_idx
  on delivery_events (user_id, created_at);
