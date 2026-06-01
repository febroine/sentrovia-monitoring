ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS slow_response_threshold_ms integer;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS notify_on_latency boolean NOT NULL DEFAULT true;
