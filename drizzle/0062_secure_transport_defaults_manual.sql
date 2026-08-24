ALTER TABLE "user_settings"
  ALTER COLUMN "smtp_require_tls" SET DEFAULT true,
  ALTER COLUMN "smtp_insecure_skip_verify" SET DEFAULT false,
  ALTER COLUMN "monitoring_ignore_ssl_errors" SET DEFAULT false;
