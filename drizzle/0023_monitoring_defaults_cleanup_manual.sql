ALTER TABLE user_settings
  DROP COLUMN IF EXISTS monitoring_region;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS monitoring_check_ssl_expiry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monitoring_cache_buster boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monitoring_save_error_pages boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monitoring_save_success_pages boolean NOT NULL DEFAULT false;
