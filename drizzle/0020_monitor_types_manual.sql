ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS monitor_type varchar(24) NOT NULL DEFAULT 'http',
  ADD COLUMN IF NOT EXISTS database_ssl boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS database_password_encrypted text;
