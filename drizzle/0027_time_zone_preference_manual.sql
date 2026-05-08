ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS time_zone varchar(100) NOT NULL DEFAULT 'Europe/Istanbul';
