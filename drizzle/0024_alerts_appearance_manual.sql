ALTER TABLE user_settings
  DROP COLUMN IF EXISTS notify_on_latency,
  DROP COLUMN IF EXISTS notify_on_ssl_expiry;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS high_contrast_surfaces boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS use_24_hour_clock boolean NOT NULL DEFAULT true;
