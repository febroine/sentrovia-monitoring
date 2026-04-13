ALTER TABLE user_settings
  ALTER COLUMN smtp_secure SET DEFAULT false,
  ALTER COLUMN smtp_require_tls SET DEFAULT false;
